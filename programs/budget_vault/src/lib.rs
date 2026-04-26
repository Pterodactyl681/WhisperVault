use anchor_lang::prelude::*;

declare_id!("FgZ3QRTju3jCdmGaznHpH8MiKjcfPwoPrHPquyytV8QB");

const BUDGET_VAULT_SEED: &[u8] = b"budget_vault";
const SECONDS_PER_DAY: i64 = 86_400;

#[program]
pub mod budget_vault {
    use super::*;

    /// Stretch-path on-chain accounting skeleton for WhisperPay Agent Vaults.
    /// This is intentionally not wired into the off-chain Agent Budget service yet.
    pub fn create_vault(
        ctx: Context<CreateVault>,
        agent: Pubkey,
        mint: Pubkey,
        total_budget: u64,
        daily_cap_percent: u8,
    ) -> Result<()> {
        initialize_vault(
            &mut ctx.accounts.budget_vault,
            ctx.accounts.owner.key(),
            agent,
            mint,
            total_budget,
            daily_cap_percent,
            Clock::get()?.unix_timestamp,
            ctx.bumps.budget_vault,
        )
    }

    pub fn check_and_spend(ctx: Context<UpdateVault>, amount: u64) -> Result<()> {
        assert_authorized(
            ctx.accounts.authority.key(),
            ctx.accounts.budget_vault.owner,
            ctx.accounts.budget_vault.agent,
        )?;
        let now = Clock::get()?.unix_timestamp;
        reset_spend_window_if_elapsed(&mut ctx.accounts.budget_vault, now)?;
        apply_spend(&mut ctx.accounts.budget_vault, amount)
    }

    pub fn reset_daily(ctx: Context<UpdateVault>) -> Result<()> {
        assert_authorized(
            ctx.accounts.authority.key(),
            ctx.accounts.budget_vault.owner,
            ctx.accounts.budget_vault.agent,
        )?;
        let now = Clock::get()?.unix_timestamp;

        // We return an explicit error when called too early so operators do not
        // accidentally assume the spend window changed during monitoring or demos.
        require!(
            has_daily_reset_elapsed(ctx.accounts.budget_vault.last_reset, now)?,
            BudgetVaultError::ResetTooEarly
        );

        ctx.accounts.budget_vault.spent_today = 0;
        ctx.accounts.budget_vault.last_reset = now;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(agent: Pubkey, mint: Pubkey, total_budget: u64, daily_cap_percent: u8)]
pub struct CreateVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init,
        payer = owner,
        space = BudgetVault::LEN,
        seeds = [
            BUDGET_VAULT_SEED,
            owner.key().as_ref(),
            agent.as_ref(),
            mint.as_ref()
        ],
        bump
    )]
    pub budget_vault: Account<'info, BudgetVault>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateVault<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [
            BUDGET_VAULT_SEED,
            budget_vault.owner.as_ref(),
            budget_vault.agent.as_ref(),
            budget_vault.mint.as_ref()
        ],
        bump = budget_vault.bump,
        constraint = authority.key() == budget_vault.owner || authority.key() == budget_vault.agent @ BudgetVaultError::Unauthorized
    )]
    pub budget_vault: Account<'info, BudgetVault>,
}

#[account]
pub struct BudgetVault {
    pub owner: Pubkey,
    pub agent: Pubkey,
    pub mint: Pubkey,
    pub total_budget: u64,
    pub current_balance: u64,
    pub daily_cap_percent: u8,
    pub spent_today: u64,
    pub last_reset: i64,
    pub bump: u8,
}

impl BudgetVault {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 8 + 8 + 1 + 8 + 8 + 1;
}

fn initialize_vault(
    vault: &mut BudgetVault,
    owner: Pubkey,
    agent: Pubkey,
    mint: Pubkey,
    total_budget: u64,
    daily_cap_percent: u8,
    now: i64,
    bump: u8,
) -> Result<()> {
    validate_total_budget(total_budget)?;
    validate_daily_cap_percent(daily_cap_percent)?;

    vault.owner = owner;
    vault.agent = agent;
    vault.mint = mint;
    vault.total_budget = total_budget;
    vault.current_balance = total_budget;
    vault.daily_cap_percent = daily_cap_percent;
    vault.spent_today = 0;
    vault.last_reset = now;
    vault.bump = bump;

    Ok(())
}

fn validate_total_budget(total_budget: u64) -> Result<()> {
    require!(total_budget > 0, BudgetVaultError::InvalidTotalBudget);
    Ok(())
}

fn validate_daily_cap_percent(daily_cap_percent: u8) -> Result<()> {
    require!(
        (1..=100).contains(&daily_cap_percent),
        BudgetVaultError::InvalidDailyCapPercent
    );
    Ok(())
}

fn validate_amount(amount: u64) -> Result<()> {
    require!(amount > 0, BudgetVaultError::InvalidAmount);
    Ok(())
}

fn assert_authorized(authority: Pubkey, owner: Pubkey, agent: Pubkey) -> Result<()> {
    require!(
        authority == owner || authority == agent,
        BudgetVaultError::Unauthorized
    );
    Ok(())
}

fn has_daily_reset_elapsed(last_reset: i64, now: i64) -> Result<bool> {
    let elapsed = now
        .checked_sub(last_reset)
        .ok_or_else(|| error!(BudgetVaultError::MathOverflow))?;
    Ok(elapsed >= SECONDS_PER_DAY)
}

fn reset_spend_window_if_elapsed(vault: &mut BudgetVault, now: i64) -> Result<bool> {
    if has_daily_reset_elapsed(vault.last_reset, now)? {
        vault.spent_today = 0;
        vault.last_reset = now;
        return Ok(true);
    }

    Ok(false)
}

fn calculate_daily_cap_amount(current_balance: u64, daily_cap_percent: u8) -> Result<u64> {
    let scaled = current_balance
        .checked_mul(daily_cap_percent as u64)
        .ok_or_else(|| error!(BudgetVaultError::MathOverflow))?;

    scaled
        .checked_div(100)
        .ok_or_else(|| error!(BudgetVaultError::MathOverflow))
}

fn apply_spend(vault: &mut BudgetVault, amount: u64) -> Result<()> {
    validate_amount(amount)?;
    validate_daily_cap_percent(vault.daily_cap_percent)?;

    let daily_cap_amount =
        calculate_daily_cap_amount(vault.current_balance, vault.daily_cap_percent)?;

    require!(
        vault.current_balance >= amount,
        BudgetVaultError::InsufficientBalance
    );
    require!(
        vault.spent_today <= daily_cap_amount,
        BudgetVaultError::DailyCapExceeded
    );

    let remaining_daily_cap = daily_cap_amount
        .checked_sub(vault.spent_today)
        .ok_or_else(|| error!(BudgetVaultError::MathOverflow))?;

    require!(amount <= remaining_daily_cap, BudgetVaultError::DailyCapExceeded);

    vault.spent_today = vault
        .spent_today
        .checked_add(amount)
        .ok_or_else(|| error!(BudgetVaultError::MathOverflow))?;
    vault.current_balance = vault
        .current_balance
        .checked_sub(amount)
        .ok_or_else(|| error!(BudgetVaultError::MathOverflow))?;

    Ok(())
}

#[error_code]
pub enum BudgetVaultError {
    #[msg("Total budget must be greater than zero.")]
    InvalidTotalBudget,
    #[msg("Daily cap percent must be between 1 and 100.")]
    InvalidDailyCapPercent,
    #[msg("Amount must be greater than zero.")]
    InvalidAmount,
    #[msg("Requested spend exceeds the remaining daily cap.")]
    DailyCapExceeded,
    #[msg("Requested spend exceeds the current balance.")]
    InsufficientBalance,
    #[msg("Math overflow or underflow occurred.")]
    MathOverflow,
    #[msg("Daily reset is not available yet.")]
    ResetTooEarly,
    #[msg("Only the vault owner or agent may perform this action.")]
    Unauthorized,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_anchor_error_name(error: Error, expected: &str) {
        match error {
            Error::AnchorError(anchor_error) => {
                assert_eq!(anchor_error.error_name, expected);
            }
            other => panic!("expected anchor error {expected}, got {other:?}"),
        }
    }

    fn sample_vault(balance: u64, daily_cap_percent: u8) -> BudgetVault {
        BudgetVault {
            owner: Pubkey::new_unique(),
            agent: Pubkey::new_unique(),
            mint: Pubkey::new_unique(),
            total_budget: balance,
            current_balance: balance,
            daily_cap_percent,
            spent_today: 0,
            last_reset: 1_700_000_000,
            bump: 255,
        }
    }

    #[test]
    fn create_vault_happy_path() {
        let mut vault = sample_vault(1, 1);
        let owner = Pubkey::new_unique();
        let agent = Pubkey::new_unique();
        let mint = Pubkey::new_unique();

        initialize_vault(&mut vault, owner, agent, mint, 300, 30, 1_700_000_100, 42).unwrap();

        assert_eq!(vault.owner, owner);
        assert_eq!(vault.agent, agent);
        assert_eq!(vault.mint, mint);
        assert_eq!(vault.total_budget, 300);
        assert_eq!(vault.current_balance, 300);
        assert_eq!(vault.daily_cap_percent, 30);
        assert_eq!(vault.spent_today, 0);
        assert_eq!(vault.last_reset, 1_700_000_100);
        assert_eq!(vault.bump, 42);
    }

    #[test]
    fn reject_total_budget_zero() {
        let mut vault = sample_vault(1, 30);
        let error = initialize_vault(
            &mut vault,
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            0,
            30,
            1_700_000_100,
            1,
        )
        .unwrap_err();

        assert_anchor_error_name(error, "InvalidTotalBudget");
    }

    #[test]
    fn reject_daily_cap_percent_zero() {
        let mut vault = sample_vault(1, 30);
        let error = initialize_vault(
            &mut vault,
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            300,
            0,
            1_700_000_100,
            1,
        )
        .unwrap_err();

        assert_anchor_error_name(error, "InvalidDailyCapPercent");
    }

    #[test]
    fn reject_daily_cap_percent_above_hundred() {
        let mut vault = sample_vault(1, 30);
        let error = initialize_vault(
            &mut vault,
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            300,
            101,
            1_700_000_100,
            1,
        )
        .unwrap_err();

        assert_anchor_error_name(error, "InvalidDailyCapPercent");
    }

    #[test]
    fn check_and_spend_under_cap_succeeds() {
        let mut vault = sample_vault(100, 30);

        apply_spend(&mut vault, 5).unwrap();

        assert_eq!(vault.spent_today, 5);
        assert_eq!(vault.current_balance, 95);
    }

    #[test]
    fn check_and_spend_over_daily_cap_fails() {
        let mut vault = sample_vault(100, 30);
        vault.spent_today = 25;

        let error = apply_spend(&mut vault, 6).unwrap_err();

        assert_anchor_error_name(error, "DailyCapExceeded");
        assert_eq!(vault.spent_today, 25);
        assert_eq!(vault.current_balance, 100);
    }

    #[test]
    fn check_and_spend_over_current_balance_fails() {
        let mut vault = sample_vault(10, 100);

        let error = apply_spend(&mut vault, 11).unwrap_err();

        assert_anchor_error_name(error, "InsufficientBalance");
        assert_eq!(vault.spent_today, 0);
        assert_eq!(vault.current_balance, 10);
    }

    #[test]
    fn spent_today_and_current_balance_update_correctly() {
        let mut vault = sample_vault(100, 50);

        apply_spend(&mut vault, 20).unwrap();

        assert_eq!(vault.spent_today, 20);
        assert_eq!(vault.current_balance, 80);
    }

    #[test]
    fn duplicate_spends_accumulate_spent_today() {
        let mut vault = sample_vault(100, 50);

        apply_spend(&mut vault, 10).unwrap();
        apply_spend(&mut vault, 5).unwrap();

        assert_eq!(vault.spent_today, 15);
        assert_eq!(vault.current_balance, 85);
    }

    #[test]
    fn reset_daily_after_window_elapsed() {
        let mut vault = sample_vault(100, 30);
        vault.spent_today = 22;
        vault.last_reset = 1_700_000_000;

        let did_reset =
            reset_spend_window_if_elapsed(&mut vault, 1_700_000_000 + SECONDS_PER_DAY).unwrap();

        assert!(did_reset);
        assert_eq!(vault.spent_today, 0);
        assert_eq!(vault.last_reset, 1_700_000_000 + SECONDS_PER_DAY);
    }

    #[test]
    fn reset_daily_too_early_is_detectable() {
        let vault = sample_vault(100, 30);

        let can_reset = has_daily_reset_elapsed(vault.last_reset, vault.last_reset + 60).unwrap();

        assert!(!can_reset);
    }

    #[test]
    fn unauthorized_signer_is_rejected() {
        let vault = sample_vault(100, 30);
        let stranger = Pubkey::new_unique();

        let error = assert_authorized(stranger, vault.owner, vault.agent).unwrap_err();

        assert_anchor_error_name(error, "Unauthorized");
    }
}
