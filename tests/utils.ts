import * as anchor from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  createMint as splCreateMint,
  createMintToInstruction,
  getMinimumBalanceForRentExemptMint,
  createInitializeMintInstruction,
  MINT_SIZE,
} from "@solana/spl-token";

export async function createRandomMint(provider, decimals) {
  const mint = await splCreateMint(
    provider.connection,
    provider.wallet.payer,
    provider.wallet.publicKey,
    null,
    decimals,
    undefined,
    undefined,
    TOKEN_PROGRAM_ID
  );
  return mint;
}

export async function mintToAccount(provider, mint, destination, amount) {
  const tx = new anchor.web3.Transaction();
  tx.add(createMintToInstruction(mint, destination, provider.wallet.publicKey, BigInt(amount)));
  await provider.sendAndConfirm(tx);
}

export async function sendLamports(provider, destination, amount) {
  const tx = new anchor.web3.Transaction();
  tx.add(
    anchor.web3.SystemProgram.transfer({
      fromPubkey: provider.wallet.publicKey,
      lamports: amount,
      toPubkey: destination,
    })
  );
  await provider.sendAndConfirm(tx);
}

export async function createMint(mintAccount, provider, mintAuthority, freezeAuthority, decimals, programId) {
  // Allocate memory for the account
  const balanceNeeded = await getMinimumBalanceForRentExemptMint(provider.connection);

  const transaction = new anchor.web3.Transaction();
  transaction.add(
    anchor.web3.SystemProgram.createAccount({
      fromPubkey: provider.wallet.payer.publicKey,
      newAccountPubkey: mintAccount.publicKey,
      lamports: balanceNeeded,
      space: MINT_SIZE,
      programId,
    }),
    createInitializeMintInstruction(mintAccount.publicKey, decimals, mintAuthority, freezeAuthority, programId)
  );

  //   transaction.add(
  //     createInitializeMintInstruction(mintAccount.publicKey, decimals, mintAuthority, freezeAuthority, programId)
  //   );

  await provider.sendAndConfirm(transaction, [mintAccount]);
  return mintAccount;
}
