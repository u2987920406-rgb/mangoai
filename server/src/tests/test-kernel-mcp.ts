// Pure unit tests for kernel-mcp.ts (Tool Registry + adapters).
// No network; the MCP-server adapter is built but not driven by a live LLM.
//
// Run: npx tsx src/test-kernel-mcp.ts

import { z } from 'zod'
import {
  ToolRegistry,
  toOpenAITools,
  toMcpServer,
  getToolRegistry,
  setToolRegistry,
  resetToolRegistry,
  type KernelTool,
} from '../kernel/kernel-mcp.js'

const line = (c = '─') => console.log(c.repeat(64))
let pass = 0
let fail = 0

function check(label: string, cond: boolean): void {
  if (cond) {
    console.log(`  ✓ ${label}`)
    pass++
  } else {
    console.log(`  ✗ ${label}`)
    fail++
  }
}

/** A simple echo tool: { value: string } → "echo:<value>". */
function echoTool(): KernelTool {
  return {
    name: 'echo',
    description: 'Echoes the given value',
    inputSchema: { value: z.string() },
    handler: (args) => ({ text: `echo:${args.value as string}` }),
  }
}

async function main(): Promise<void> {
  line('═')
  console.log('registry — register / has / get / list / names')
  line()
  {
    const reg = new ToolRegistry()
    reg.register(echoTool())
    check('has registered tool', reg.has('echo'))
    check('get returns the tool', reg.get('echo')?.name === 'echo')
    check('list has 1 tool', reg.list().length === 1)
    check('names lists the tool', reg.names().join() === 'echo')
    check('has unknown → false', reg.has('nope') === false)
  }

  line('═')
  console.log('registry — duplicate registration throws')
  line()
  {
    const reg = new ToolRegistry()
    reg.register(echoTool())
    let threw = false
    try {
      reg.register(echoTool())
    } catch {
      threw = true
    }
    check('registering same name twice throws', threw === true)
  }

  line('═')
  console.log('invoke — runs handler, validates args')
  line()
  {
    const reg = new ToolRegistry()
    reg.register(echoTool())
    const r = await reg.invoke('echo', { value: 'hi' })
    check('invoke returns handler result', r.text === 'echo:hi')

    let unknownThrew = false
    try {
      await reg.invoke('nope', {})
    } catch {
      unknownThrew = true
    }
    check('invoke unknown tool throws', unknownThrew === true)

    let invalidThrew = false
    try {
      await reg.invoke('echo', { value: 123 }) // value must be a string
    } catch {
      invalidThrew = true
    }
    check('invoke validates args against schema', invalidThrew === true)
  }

  line('═')
  console.log('invoke — async handler + isError passthrough')
  line()
  {
    const reg = new ToolRegistry()
    reg.register({
      name: 'fail',
      description: 'always errors',
      inputSchema: {},
      handler: async () => ({ text: 'nope', isError: true }),
    })
    const r = await reg.invoke('fail', {})
    check('async handler awaited', r.text === 'nope')
    check('isError passed through', r.isError === true)
  }

  line('═')
  console.log('toOpenAITools — function-calling shape + JSON schema')
  line()
  {
    const reg = new ToolRegistry()
    reg.register(echoTool())
    const tools = toOpenAITools(reg)
    check('one OpenAI tool produced', tools.length === 1)
    const f = tools[0]
    check("type is 'function'", f.type === 'function')
    check('function name matches', f.function.name === 'echo')
    check('function description matches', f.function.description === 'Echoes the given value')
    const params = f.function.parameters as { type?: string; properties?: Record<string, unknown> }
    check("parameters is a JSON-schema object", params.type === 'object')
    check('parameters expose the value property', !!params.properties && 'value' in params.properties)
  }

  line('═')
  console.log('toMcpServer — builds an in-process MCP server')
  line()
  {
    const reg = new ToolRegistry()
    reg.register(echoTool())
    const server = toMcpServer(reg, 'kernel')
    check('returns a defined server object', server !== null && server !== undefined)
    check('server is an object', typeof server === 'object')
    // empty registry must still build a valid (empty) server
    const empty = toMcpServer(new ToolRegistry(), 'empty')
    check('empty registry builds a server too', empty !== null && empty !== undefined)
  }

  line('═')
  console.log('singleton — get / set / reset')
  line()
  {
    resetToolRegistry()
    const a = getToolRegistry()
    check('getToolRegistry stable singleton', a === getToolRegistry())
    const custom = new ToolRegistry()
    setToolRegistry(custom)
    check('setToolRegistry swaps', getToolRegistry() === custom)
    resetToolRegistry()
    check('resetToolRegistry forces fresh', getToolRegistry() !== custom)
  }

  line('═')
  const total = pass + fail
  if (fail === 0) {
    console.log(`✅ All ${total}/${total} checks passed.`)
    process.exit(0)
  } else {
    console.log(`❌ ${fail}/${total} check(s) failed.`)
    process.exit(1)
  }
}

void main()
