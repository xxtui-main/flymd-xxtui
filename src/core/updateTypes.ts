// 更新相关类型定义

export type UpdateAssetInfo = {
  name: string
  size: number
  directUrl: string
  proxyUrl: string
}

export type CheckUpdateResp = {
  hasUpdate: boolean
  current: string
  latest: string
  releaseName: string
  notes: string
  htmlUrl: string
  assetWin?: UpdateAssetInfo | null
  assetLinuxAppimage?: UpdateAssetInfo | null
  assetLinuxDeb?: UpdateAssetInfo | null
  assetMacosX64?: UpdateAssetInfo | null
  assetMacosArm?: UpdateAssetInfo | null
}

// 可选的“额外信息”注入：位于 public/update-extra.json，由运维/作者按需维护
export type UpdateExtra = {
  html?: string
  links?: { text: string; href: string }[]
}

