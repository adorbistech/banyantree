import { Command } from 'commander'
import { print } from '../output.js'

export function replayCommand(): Command {
  return new Command('replay')
    .description('Replay reasoning from a past session')
    .argument('<session-id>', 'Session ID to replay')
    .action(async (sessionId: string) => {
      print(`Replaying session: ${sessionId}`)
      print('Reasoning replay — Phase 2 feature. Coming after core cognition is validated.')
    })
}
