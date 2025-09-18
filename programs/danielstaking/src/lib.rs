use anchor_lang::prelude::*;

declare_id!("2xoAoRGcm47pSQZShj5muH8b763iyREz388bw2YGQS6L");

#[program]
pub mod danielstaking {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
