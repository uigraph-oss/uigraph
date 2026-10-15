import fs from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import pc from 'picocolors'
import { VERSION } from './version.js'

const NAME = 'UIGraph'
const WEBSITE = 'https://uigraph.app'
const TAGLINE = 'Map your project into services, APIs and diagrams'

function blue(text: string) {
  return pc.isColorSupported ? `\x1b[38;2;59;107;255m${text}\x1b[39m` : text
}

const MARK: [number, number, string][] = [[0, 0, pc.white('⏺')]]
for (let col = 1; col < 5; col++) MARK.push([0, col, blue('━')])
MARK.push([0, 5, blue('⏺')])
MARK.push([1, 5, blue('┃')])
MARK.push([2, 5, blue('⏺')])
for (let col = 4; col > 0; col--) MARK.push([2, col, blue('━')])
MARK.push([2, 0, blue('⏺')])
MARK.push([1, 0, blue('┃')])

function imageProtocol() {
  const program = process.env.TERM_PROGRAM
  if (program === 'iTerm.app' || program === 'WezTerm') {
    return 'iterm'
  }
  if (
    program === 'ghostty' ||
    process.env.TERM === 'xterm-kitty' ||
    process.env.KITTY_WINDOW_ID
  ) {
    return 'kitty'
  }
  return null
}

function logoImage(protocol: 'iterm' | 'kitty') {
  const file = fs.readFileSync(new URL('./uigraph-mark.png', import.meta.url))
  const png = file.toString('base64')
  if (protocol === 'iterm') {
    return `\x1b]1337;File=inline=1;size=${file.length};height=3;preserveAspectRatio=1:${png}\x07`
  }
  const chunks = png.match(/.{1,4096}/g)!
  return chunks
    .map((chunk, index) => {
      const more = index < chunks.length - 1 ? 1 : 0
      const keys = index === 0 ? `a=T,f=100,r=3,C=1,q=2,m=${more}` : `m=${more}`
      return `\x1b_G${keys};${chunk}\x1b\\`
    })
    .join('')
}

function render(frame: number, markFrames: number) {
  const grid = Array.from({ length: 3 }, () => Array<string>(6).fill(' '))
  for (const [row, col, char] of MARK.slice(0, Math.min(frame, markFrames))) {
    grid[row]![col] = char
  }
  const letters = Math.max(0, frame - markFrames)
  const done = letters > NAME.length
  const text = [
    pc.bold(NAME.slice(0, letters)) + (done ? pc.dim(` v${VERSION}`) : ''),
    done ? blue(WEBSITE) : '',
    done ? pc.dim(TAGLINE) : '',
  ]
  return grid
    .map((cells, row) => `  ${cells.join('')}    ${text[row]}\x1b[K`)
    .join('\n')
}

export async function showBanner() {
  if (!process.stdout.isTTY) {
    return
  }
  const protocol = imageProtocol()
  const markFrames = protocol ? 0 : MARK.length
  const frames = markFrames + NAME.length + 1
  process.stdout.write('\n')
  for (let frame = 1; frame <= frames; frame++) {
    process.stdout.write(
      `${frame === 1 ? '' : '\x1b[2A\r'}${render(frame, markFrames)}`
    )
    if (frame === frames && protocol) {
      process.stdout.write(`\x1b7\x1b[2A\r\x1b[2C${logoImage(protocol)}\x1b8`)
    }
    await sleep(20)
  }
  process.stdout.write('\n')
}
