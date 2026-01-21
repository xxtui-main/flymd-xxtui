// 基于字符串生成柔和的 HSL 颜色
export function stringToColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const h = Math.abs(hash) % 360  // 色相 0-360
  const s = 55                     // 饱和度 55%（柔和）
  const l = 50                     // 亮度 50%（适中，确保白字可读）
  return `hsl(${h}, ${s}%, ${l}%)`
}
