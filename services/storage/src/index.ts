import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import * as path from "path";

export type StorageObject = {
  uri: string;
  checksum: string;
  contentType: string;
  byteLength: number;
};

export type ChainProof = {
  taskPda: string;
  wallet: string;
  role: "requestor" | "worker" | "judge";
  slot: number;
  signature: string;
  commitment: "confirmed" | "finalized";
};

export type StorageAccessRequest = {
  objectUri: string;
  proof?: ChainProof;
};

export function sha256(bytes: Buffer | string) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function assertChainProof(request: StorageAccessRequest) {
  if (
    !request.proof?.taskPda ||
    !request.proof.wallet ||
    !request.proof.slot ||
    !request.proof.signature ||
    !request.proof.commitment
  ) {
    throw new Error("Storage access requires confirmed on-chain proof.");
  }
}

export class LocalImmutableStorage {
  constructor(private readonly rootDir: string) {}

  async put(bytes: Buffer, contentType: string): Promise<StorageObject> {
    const checksum = sha256(bytes);
    const relativePath = `${checksum}.bin`;
    const absolutePath = path.join(this.rootDir, relativePath);

    await mkdir(this.rootDir, { recursive: true });
    await writeFile(absolutePath, bytes, { flag: "wx" }).catch((error) => {
      if (error?.code !== "EEXIST") {
        throw error;
      }
    });

    return {
      uri: `local://${relativePath}`,
      checksum,
      contentType,
      byteLength: bytes.length,
    };
  }

  async get(request: StorageAccessRequest): Promise<Buffer> {
    assertChainProof(request);

    if (!request.objectUri.startsWith("local://")) {
      throw new Error("Unsupported local storage URI.");
    }

    return readFile(
      path.join(this.rootDir, request.objectUri.replace("local://", ""))
    );
  }
}
