import nacl from "tweetnacl";

export function verifyEd25519(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  if (signature.length !== 64 || publicKey.length !== 32) {
    return false;
  }

  try {
    return nacl.sign.detached.verify(message, signature, publicKey);
  } catch {
    return false;
  }
}
