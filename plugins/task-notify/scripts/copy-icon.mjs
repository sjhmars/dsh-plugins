/**
 * Copy toast assets next to the Host bundle.
 * PowerShell 5 无 BOM 会按系统 ANSI 读脚本，中文行可能把换行吞掉导致解析失败。
 */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'

copyFileSync('assets/icon.png', 'lib/icon.png')
copyFileSync('src/toast-activate.vbs', 'lib/toast-activate.vbs')

const bom = Buffer.from([0xEF, 0xBB, 0xBF])
function writePs1(src, dest) {
  const ps1 = readFileSync(src)
  writeFileSync(dest, ps1[0] === 0xEF ? ps1 : Buffer.concat([bom, ps1]))
}
writePs1('src/show-toast.ps1', 'lib/show-toast.ps1')
writePs1('src/show-approval-ui.ps1', 'lib/show-approval-ui.ps1')
