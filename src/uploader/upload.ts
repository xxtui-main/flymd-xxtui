import type { AnyUploaderConfig } from './types'
import { uploadImageToS3R2 } from './s3'
import { uploadImageToImgLa } from './imgla'

export async function uploadImageToCloud(
  input: Blob | ArrayBuffer | Uint8Array,
  fileName: string,
  contentType: string,
  cfg: AnyUploaderConfig,
): Promise<{ key: string; publicUrl: string }> {
  if (cfg.provider === 'imgla') {
    const r = await uploadImageToImgLa(input, fileName, contentType, cfg)
    return { key: r.key, publicUrl: r.publicUrl }
  }
  return await uploadImageToS3R2(input, fileName, contentType, cfg)
}

