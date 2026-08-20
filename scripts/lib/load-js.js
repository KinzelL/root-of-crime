const fs = require('fs');
const path = require('path');
const vm = require('vm');

function runFile(ctx, file) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
}

function loadCampaign(ctx, root) {
  runFile(ctx, path.join(root, 'js/vfs.js'));
  runFile(ctx, path.join(root, 'js/virt.js'));
  runFile(ctx, path.join(root, 'js/missions.js'));
  const sources = ctx.Missions && ctx.Missions.SOURCES;
  if (!sources || !sources.length) throw new Error('Missions.SOURCES is empty');
  sources.forEach((file) => {
    runFile(ctx, path.join(root, 'js/missions', file));
  });
  runFile(ctx, path.join(root, 'js/jobs.js'));
  runFile(ctx, path.join(root, 'js/infra.js'));
}

function loadGame(ctx, root) {
  loadCampaign(ctx, root);
  runFile(ctx, path.join(root, 'js/terminal.js'));
  const cmds = ctx.Terminal && ctx.Terminal.COMMAND_SOURCES;
  if (!cmds || !cmds.length) throw new Error('Terminal.COMMAND_SOURCES is empty');
  cmds.forEach((file) => {
    runFile(ctx, path.join(root, 'js/commands', file));
  });
  runFile(ctx, path.join(root, 'js/story.js'));
  runFile(ctx, path.join(root, 'js/game.js'));
  runFile(ctx, path.join(root, 'js/windows.js'));
  runFile(ctx, path.join(root, 'js/desktop.js'));
}

module.exports = { loadCampaign, loadGame };
