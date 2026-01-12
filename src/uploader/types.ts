// 图床配置类型：支持内置 S3/R2 与 ImgLa（Lsky Pro+）
// 目标：不破坏旧配置结构；新增 provider 分发即可

export type UploaderProvider = 's3' | 'imgla'

export type UploaderCommon = {
  enabled: boolean
  provider: UploaderProvider
  // 前端转码配置（与旧版保持一致）
  convertToWebp?: boolean
  webpQuality?: number
  saveLocalAsWebp?: boolean
}

export type S3UploaderConfig = UploaderCommon & {
  provider: 's3'
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  region?: string
  endpoint?: string
  customDomain?: string
  keyTemplate?: string
  aclPublicRead?: boolean
  forcePathStyle?: boolean
}

export type ImgLaUploaderConfig = UploaderCommon & {
  provider: 'imgla'
  baseUrl: string
  token: string
  // Lsky Pro+ 的策略 ID（通常必填，默认 1）
  strategyId: number
  // 默认相册（可选）
  albumId?: number
}

export type AnyUploaderConfig = S3UploaderConfig | ImgLaUploaderConfig

