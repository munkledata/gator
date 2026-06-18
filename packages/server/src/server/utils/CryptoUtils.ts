import { createHash, randomBytes } from "crypto";


export const generateMd5Hash = (data: Buffer): string => {
    // Cast: with multiple @types/node versions in the tree, the global Buffer and
    // crypto's BinaryLike can come from different declarations; a Uint8Array view
    // is behavior-identical and satisfies BinaryLike.
    return createHash("md5").update(data as unknown as Uint8Array).digest("hex");
};

export const generateRandomString = (length: number): string => {
    return randomBytes(Math.ceil(length / 2)).toString('hex');
};