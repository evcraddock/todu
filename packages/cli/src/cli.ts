#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('todu')
  .description('Local-first task management')
  .version('0.0.1');

program
  .command('task')
  .description('Manage tasks')
  .action(() => {
    console.log('Task commands coming soon...');
  });

program
  .command('project')
  .description('Manage projects')
  .action(() => {
    console.log('Project commands coming soon...');
  });

program
  .command('sync')
  .description('Sync with server')
  .action(() => {
    console.log('Sync coming soon...');
  });

program.parse();
