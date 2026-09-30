const { execSync } = require('child_process')
let Registry = null
if (process.platform === 'win32') {
  try {
    Registry = require('winreg')
  } catch (e) {}
}

const proxyStatus = {
  started: false
}

const getMacActiveService = () => {
  try {
    const out = execSync('networksetup -listnetworkserviceorder', { encoding: 'utf8' })
    const lines = out.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^\(\d+\)\s+(.+)$/)
      if (match) {
        const service = match[1]
        const nextLine = lines[i + 1] || ''
        const devMatch = nextLine.match(/Device:\s*(\w+)/)
        if (devMatch) {
          const dev = devMatch[1]
          try {
            const status = execSync(`ifconfig ${dev}`, { encoding: 'utf8' })
            if (status.includes('status: active') || status.includes('inet ')) {
              return service
            }
          } catch (e) {}
        }
      }
    }
  } catch (e) {}
  return 'Wi-Fi'
}

let activeMacService = null

const setMacProxy = async (enable, ip = '127.0.0.1', port = '8345') => {
  try {
    if (!activeMacService) {
      activeMacService = getMacActiveService()
    }
    const service = activeMacService
    if (enable) {
      execSync(`networksetup -setwebproxy "${service}" ${ip} ${port}`)
      execSync(`networksetup -setsecurewebproxy "${service}" ${ip} ${port}`)
    } else {
      execSync(`networksetup -setwebproxystate "${service}" off`)
      execSync(`networksetup -setsecurewebproxystate "${service}" off`)
    }
  } catch (e) {
    console.error('macOS proxy config error:', e)
  }
}

const setProxy = async (enable, proxyIp = '', ignoreIp = '') => {
  if (process.platform === 'darwin') {
    if (enable === '1') {
      const [ip, port] = proxyIp.split(':')
      await setMacProxy(true, ip, port)
    } else {
      await setMacProxy(false)
    }
    return
  }

  if (!Registry) return

  const regKey = new Registry({
    hive: Registry.HKCU,
    key:  '\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
  })

  const regSet = function (key, type, value) {
    return new Promise((rev, rej) => {
      regKey.set(key, type, value, function (err) {
        if (err) rej(err)
        rev()
      })
    })
  }
  await regSet('ProxyEnable', Registry.REG_DWORD, enable)
  await regSet('ProxyServer', Registry.REG_SZ, proxyIp)
  await regSet('ProxyOverride', Registry.REG_SZ, ignoreIp)
}

const enableProxy = async (ip, port) => {
  const proxyIp = `${ip}:${port}`
  const ignoreIp = 'localhost;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;192.168.*;<local>'
  await setProxy('1', proxyIp, ignoreIp)
  proxyStatus.started = true
}

const disableProxy = async () => {
  await setProxy('0')
  proxyStatus.started = false
}

module.exports = {
  enableProxy, disableProxy, proxyStatus
}