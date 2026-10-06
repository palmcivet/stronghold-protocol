/** 在一组地址里取下一个还没失败的。空字符串跳过。 */
export function nextArtUrl(urls: readonly string[], failed: ReadonlySet<string>): string | null {
  for (const url of urls) if (url && !failed.has(url)) return url
  return null
}
