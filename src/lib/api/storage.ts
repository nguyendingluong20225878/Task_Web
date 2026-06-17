export type DevStorageObject = {
  uri: string;
  checksum: string;
};

/**
 * Dev-only browser helper for local UI experiments.
 *
 * Production requestor publish should receive URI/checksum/proof from a backend
 * storage API. Do not use this helper for values that will be written on-chain.
 */
export async function uploadToDevLocalStorage(
  payload: unknown,
  bucket: "public-metadata" | "encrypted-payload"
): Promise<DevStorageObject> {
  await new Promise((resolve) => setTimeout(resolve, 450));

  const encoded = btoa(JSON.stringify(payload)).slice(0, 18);

  return {
    uri: `local://dev/${bucket}/${encoded}`,
    checksum: `dev-sha256-${encoded}`,
  };
}
