import * as anchor from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import * as utils from "./utils";
import * as assert from "assert";
import * as fs from "fs";
import { exit } from "process";
import { DanielStaking } from "../target/types/dainel_staking";

let program = anchor.workspace.DanielStaking as anchor.Program<DanielStaking>;
//represents an outside actor
//owns mints out of any other actors control, provides initial $$ to others
const envProvider = anchor.AnchorProvider.env(); //load provider from env
anchor.setProvider(envProvider);

let provider = envProvider;

describe("daniel-staking", () => {
  //hardcoded in program, read from test keys directory for testing
  let mintKey;
  let mintObject;
  let mintPubkey;
  let xMintObject;
  let xMintPubkey;

  //the program's vault for stored collateral against xToken minting
  let vaultPubkey;
  let vaultBump;

  it("Is initialized!", async () => {
    //this already exists in ecosystem
    //test step token hardcoded in program, mint authority is wallet for testing
    let rawdata = fs.readFileSync("tests/keys/step-teST1ieLrLdr4MJPZ7i8mgSCLQ7rTrPRjNnyFdHFaz9.json", "utf8");
    let keyData = JSON.parse(rawdata);
    mintKey = anchor.web3.Keypair.fromSecretKey(new Uint8Array(keyData));
    mintObject = await utils.createMint(mintKey, provider, provider.wallet.publicKey, null, 9, TOKEN_PROGRAM_ID);
    mintPubkey = mintObject.publicKey;

    [vaultPubkey, vaultBump] = await anchor.web3.PublicKey.findProgramAddressSync(
      [mintPubkey.toBuffer()],
      program.programId
    );

    //this is the new xstep token
    //test xstep token hardcoded in program, mint authority is token vault
    rawdata = fs.readFileSync("tests/keys/xstep-TestZ4qmw6fCo1uK9oJbobWDgj1sME6hR1ssWQnyjxM.json", "utf8");
    keyData = JSON.parse(rawdata);
    let key = anchor.web3.Keypair.fromSecretKey(new Uint8Array(keyData));
    xMintObject = await utils.createMint(key, provider, vaultPubkey, null, 9, TOKEN_PROGRAM_ID);
    xMintPubkey = xMintObject.publicKey;

    await program.methods
      .initialize(vaultBump)
      .accounts({
        tokenMint: mintPubkey,
        tokenVault: vaultPubkey,
        initializer: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();
  });

  let walletTokenAccount;
  let walletXTokenAccount;

  it("Mint test tokens", async () => {
    walletTokenAccount = getAssociatedTokenAddressSync(mintPubkey, provider.wallet.publicKey);
    walletXTokenAccount = getAssociatedTokenAddressSync(xMintPubkey, provider.wallet.publicKey);

    // Create the associated token accounts
    const createTokenAccountTx = new anchor.web3.Transaction();
    createTokenAccountTx.add(
      createAssociatedTokenAccountInstruction(
        provider.wallet.publicKey, // payer
        walletTokenAccount, // ata
        provider.wallet.publicKey, // owner
        mintPubkey // mint
      )
    );
    createTokenAccountTx.add(
      createAssociatedTokenAccountInstruction(
        provider.wallet.publicKey, // payer
        walletXTokenAccount, // ata
        provider.wallet.publicKey, // owner
        xMintPubkey // mint
      )
    );
    await provider.sendAndConfirm(createTokenAccountTx);

    await utils.mintToAccount(provider, mintPubkey, walletTokenAccount, 100_000_000_000);
  });

  it("Swap token for xToken", async () => {
    await program.methods
      .stake(vaultBump, new anchor.BN(5_000_000_000))
      .accounts({
        tokenMint: mintPubkey,
        xTokenMint: xMintPubkey,
        tokenFrom: walletTokenAccount,
        tokenFromAuthority: provider.wallet.publicKey,
        tokenVault: vaultPubkey,
        xTokenTo: walletXTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    assert.strictEqual(await getTokenBalance(walletTokenAccount), 95_000_000_000);
    assert.strictEqual(await getTokenBalance(walletXTokenAccount), 5_000_000_000);
    assert.strictEqual(await getTokenBalance(vaultPubkey), 5_000_000_000);
  });

  it("Airdrop some tokens to the pool", async () => {
    await utils.mintToAccount(provider, mintPubkey, vaultPubkey, 1_000_000_000);

    assert.strictEqual(await getTokenBalance(walletTokenAccount), 95_000_000_000);
    assert.strictEqual(await getTokenBalance(walletXTokenAccount), 5_000_000_000);
    assert.strictEqual(await getTokenBalance(vaultPubkey), 6_000_000_000);
  });

  it("Emit the price", async () => {
    const res = await program.methods
      .emitPrice()
      .accounts({
        tokenMint: mintPubkey,
        xTokenMint: xMintPubkey,
        tokenVault: vaultPubkey,
      })
      .simulate();
    let price = res.events[0].data;
    console.log("Emit price: ", price.stepPerXstepE9.toString());
    console.log("Emit price: ", price.stepPerXstep.toString());
    assert.strictEqual(price.stepPerXstep.toString(), "1.2");
  });

  it("Redeem xToken for token", async () => {
    await program.methods
      .unstake(vaultBump, new anchor.BN(5_000_000_000))
      .accounts({
        tokenMint: mintPubkey,
        xTokenMint: xMintPubkey,
        xTokenFrom: walletXTokenAccount,
        xTokenFromAuthority: provider.wallet.publicKey,
        tokenVault: vaultPubkey,
        tokenTo: walletTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    assert.strictEqual(await getTokenBalance(walletTokenAccount), 101_000_000_000);
    assert.strictEqual(await getTokenBalance(walletXTokenAccount), 0);
    assert.strictEqual(await getTokenBalance(vaultPubkey), 0);
  });

  it("Airdrop some tokens to the pool before xToken creation", async () => {
    await utils.mintToAccount(provider, mintPubkey, vaultPubkey, 5_000_000_000);

    assert.strictEqual(await getTokenBalance(vaultPubkey), 5_000_000_000);
  });

  it("Swap token for xToken on prefilled pool", async () => {
    await program.methods
      .stake(vaultBump, new anchor.BN(5_000_000_000))
      .accounts({
        tokenMint: mintPubkey,
        xTokenMint: xMintPubkey,
        tokenFrom: walletTokenAccount,
        tokenFromAuthority: provider.wallet.publicKey,
        tokenVault: vaultPubkey,
        xTokenTo: walletXTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    assert.strictEqual(await getTokenBalance(walletTokenAccount), 96_000_000_000);
    assert.strictEqual(await getTokenBalance(walletXTokenAccount), 5_000_000_000);
    assert.strictEqual(await getTokenBalance(vaultPubkey), 10_000_000_000);
  });

  it("Redeem xToken for token after prefilled pool", async () => {
    await program.methods
      .unstake(vaultBump, new anchor.BN(5_000_000_000))
      .accounts({
        tokenMint: mintPubkey,
        xTokenMint: xMintPubkey,
        xTokenFrom: walletXTokenAccount,
        xTokenFromAuthority: provider.wallet.publicKey,
        tokenVault: vaultPubkey,
        tokenTo: walletTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    assert.strictEqual(await getTokenBalance(walletTokenAccount), 106_000_000_000);
    assert.strictEqual(await getTokenBalance(walletXTokenAccount), 0);
    assert.strictEqual(await getTokenBalance(vaultPubkey), 0);
  });

  it("Can rescue ata funds if someone accidentally creates an ata off vault", async () => {
    const badAta = getAssociatedTokenAddressSync(mintPubkey, vaultPubkey, true);
    const tx = new anchor.web3.Transaction().add(
      await createAssociatedTokenAccountInstruction(provider.wallet.publicKey, badAta, vaultPubkey, mintPubkey)
    );
    await provider.sendAndConfirm(tx);

    await utils.mintToAccount(provider, mintPubkey, badAta, 1_000_000_000);
    await program.methods
      .withdrawNested()
      .accounts({
        tokenMint: mintPubkey,
        tokenVault: vaultPubkey,
        refundee: provider.wallet.publicKey,
        tokenVaultNestedAta: badAta,
      })
      .rpc();

    const ataA = await provider.connection.getAccountInfo(badAta);
    assert.strictEqual(ataA, null);
    assert.strictEqual(await getTokenBalance(vaultPubkey), 1_000_000_000);
  });

  it("exit because something weird is happening", async () => {
    setTimeout(() => {
      exit(0);
    }, 1000);
  });
});

async function getTokenBalance(pubkey) {
  return parseInt((await provider.connection.getTokenAccountBalance(pubkey)).value.amount);
}
