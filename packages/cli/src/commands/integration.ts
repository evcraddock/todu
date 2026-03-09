import type { IntegrationBinding, IntegrationBindingStatus } from "@todu/core";
import { isSyncStrategy } from "@todu/core";
import type { Command } from "commander";
import { type CliDaemonInvoker, formatDaemonCommandError } from "../daemon-command-client.js";
import { formatJSON, formatTable } from "../format.js";

const INTEGRATION_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "provider", label: "Provider" },
  { key: "project", label: "Project" },
  { key: "targetKind", label: "Target Kind" },
  { key: "targetRef", label: "Target" },
  { key: "strategy", label: "Strategy" },
  { key: "enabled", label: "Enabled" },
];

const INTEGRATION_STATUS_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "provider", label: "Provider" },
  { key: "project", label: "Project" },
  { key: "state", label: "State" },
  { key: "enabled", label: "Enabled" },
  { key: "authority", label: "Authority" },
  { key: "lastSuccess", label: "Last Success" },
  { key: "lastError", label: "Last Error" },
];

interface IntegrationBindingWithStatus {
  binding: IntegrationBinding;
  status: IntegrationBindingStatus;
}

function formatEnabled(enabled: boolean): string {
  return enabled ? "yes" : "no";
}

function integrationToRow(
  binding: IntegrationBinding,
  projectName?: string,
): Record<string, string> {
  return {
    id: binding.id,
    provider: binding.provider,
    project: projectName ?? binding.projectId,
    targetKind: binding.targetKind,
    targetRef: binding.targetRef,
    strategy: binding.strategy,
    enabled: formatEnabled(binding.enabled),
  };
}

function integrationDetail(binding: IntegrationBinding, projectName?: string): string {
  const lines = [
    `ID:          ${binding.id}`,
    `Provider:    ${binding.provider}`,
    `Project:     ${projectName ?? binding.projectId}`,
    `Target Kind: ${binding.targetKind}`,
    `Target:      ${binding.targetRef}`,
    `Strategy:    ${binding.strategy}`,
    `Enabled:     ${formatEnabled(binding.enabled)}`,
    `Created:     ${binding.createdAt}`,
    `Updated:     ${binding.updatedAt}`,
  ];

  return lines.join("\n");
}

function integrationStatusToRow(
  item: IntegrationBindingWithStatus,
  projectName?: string,
): Record<string, string> {
  return {
    id: item.binding.id,
    provider: item.binding.provider,
    project: projectName ?? item.binding.projectId,
    state: item.status.state,
    enabled: formatEnabled(item.binding.enabled),
    authority: item.status.authorityId ?? "-",
    lastSuccess: item.status.lastSuccessfulSyncAt ?? "-",
    lastError: item.status.lastErrorSummary ?? "-",
  };
}

function integrationStatusDetail(item: IntegrationBindingWithStatus, projectName?: string): string {
  const lines = [
    `ID:                  ${item.binding.id}`,
    `Provider:            ${item.binding.provider}`,
    `Project:             ${projectName ?? item.binding.projectId}`,
    `Target Kind:         ${item.binding.targetKind}`,
    `Target:              ${item.binding.targetRef}`,
    `Strategy:            ${item.binding.strategy}`,
    `Enabled:             ${formatEnabled(item.binding.enabled)}`,
    `State:               ${item.status.state}`,
    `Authority:           ${item.status.authorityId ?? "-"}`,
    `Last Attempted Sync: ${item.status.lastAttemptedSyncAt ?? "-"}`,
    `Last Successful:     ${item.status.lastSuccessfulSyncAt ?? "-"}`,
    `Last Error:          ${item.status.lastErrorSummary ?? "-"}`,
    `Updated:             ${item.status.updatedAt}`,
  ];

  return lines.join("\n");
}

async function resolveProjectId(
  invokeDaemon: CliDaemonInvoker,
  ref: string,
): Promise<{ ok: true; id: string; name: string } | { ok: false; message: string }> {
  const byId = await invokeDaemon<{ id: string; name: string }>("project.get", { id: ref });
  if (byId.ok) {
    return { ok: true, id: byId.value.id, name: byId.value.name };
  }

  if (byId.error.code !== "NOT_FOUND") {
    return { ok: false, message: formatDaemonCommandError(byId.error) };
  }

  const list = await invokeDaemon<Array<{ id: string; name: string }>>("project.list", {});
  if (!list.ok) {
    return { ok: false, message: formatDaemonCommandError(list.error) };
  }

  const matches = list.value.filter((project) => project.name.toLowerCase() === ref.toLowerCase());
  if (matches.length === 1) {
    return { ok: true, id: matches[0].id, name: matches[0].name };
  }

  if (matches.length > 1) {
    return { ok: false, message: `Multiple projects match "${ref}". Use the project ID instead.` };
  }

  return { ok: false, message: `Project not found: ${ref}` };
}

async function buildProjectNameMap(
  invokeDaemon: CliDaemonInvoker,
): Promise<Record<string, string>> {
  const result = await invokeDaemon<Array<{ id: string; name: string }>>("project.list", {});
  if (!result.ok) {
    return {};
  }

  const projectNames: Record<string, string> = {};
  for (const project of result.value) {
    projectNames[project.id] = project.name;
  }

  return projectNames;
}

async function getIntegrationBinding(
  invokeDaemon: CliDaemonInvoker,
  id: string,
): Promise<{ ok: true; value: IntegrationBinding } | { ok: false; message: string }> {
  const result = await invokeDaemon<IntegrationBinding>("integration.get", { id });
  if (!result.ok) {
    return { ok: false, message: formatDaemonCommandError(result.error) };
  }

  return { ok: true, value: result.value };
}

async function getIntegrationBindingStatus(
  invokeDaemon: CliDaemonInvoker,
  id: string,
): Promise<{ ok: true; value: IntegrationBindingStatus } | { ok: false; message: string }> {
  const result = await invokeDaemon<IntegrationBindingStatus>("integration.status", { id });
  if (!result.ok) {
    return { ok: false, message: formatDaemonCommandError(result.error) };
  }

  return { ok: true, value: result.value };
}

async function listIntegrationBindingsWithStatus(
  invokeDaemon: CliDaemonInvoker,
): Promise<{ ok: true; value: IntegrationBindingWithStatus[] } | { ok: false; message: string }> {
  const bindingsResult = await invokeDaemon<IntegrationBinding[]>("integration.list", {});
  if (!bindingsResult.ok) {
    return { ok: false, message: formatDaemonCommandError(bindingsResult.error) };
  }

  const bindingsWithStatus: IntegrationBindingWithStatus[] = [];
  for (const binding of bindingsResult.value) {
    const statusResult = await getIntegrationBindingStatus(invokeDaemon, binding.id);
    if (!statusResult.ok) {
      return { ok: false, message: statusResult.message };
    }

    bindingsWithStatus.push({
      binding,
      status: statusResult.value,
    });
  }

  return {
    ok: true,
    value: bindingsWithStatus,
  };
}

export function registerIntegrationCommands(
  program: Command,
  invokeDaemon: CliDaemonInvoker,
): void {
  const integration = program.command("integration").description("Manage integration bindings");

  integration
    .command("list")
    .description("List integration bindings")
    .option("--provider <provider>", "filter by provider")
    .option("--project <project>", "filter by project (ID or name)")
    .option("--enabled", "show only enabled bindings")
    .option("--disabled", "show only disabled bindings")
    .action(async (opts) => {
      if (opts.enabled && opts.disabled) {
        console.error("Error: --enabled and --disabled cannot be used together");
        process.exitCode = 1;
        return;
      }

      let projectId: string | undefined;
      if (opts.project) {
        const project = await resolveProjectId(invokeDaemon, opts.project);
        if (!project.ok) {
          console.error(project.message);
          process.exitCode = 1;
          return;
        }

        projectId = project.id;
      }

      const filter: Record<string, unknown> = {};
      if (opts.provider) filter.provider = opts.provider;
      if (projectId) filter.projectId = projectId;
      if (opts.enabled) filter.enabled = true;
      if (opts.disabled) filter.enabled = false;

      const result = await invokeDaemon<IntegrationBinding[]>("integration.list", {
        ...(Object.keys(filter).length > 0 ? { filter } : {}),
      });

      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      const format = program.opts().format;
      if (format === "json") {
        console.log(formatJSON(result.value));
        return;
      }

      const projectNames = await buildProjectNameMap(invokeDaemon);
      console.log(
        formatTable(
          result.value.map((binding) => integrationToRow(binding, projectNames[binding.projectId])),
          INTEGRATION_COLUMNS,
        ),
      );
    });

  integration
    .command("add")
    .description("Create an integration binding")
    .requiredOption("--provider <provider>", "provider name")
    .requiredOption("--project <project>", "project (ID or name)")
    .requiredOption("--target-kind <kind>", "target kind")
    .requiredOption("--target <target>", "target reference")
    .option("--strategy <strategy>", "sync strategy (bidirectional, pull, push, none)")
    .option("--disabled", "create the integration binding disabled")
    .action(async (opts) => {
      const project = await resolveProjectId(invokeDaemon, opts.project);
      if (!project.ok) {
        console.error(project.message);
        process.exitCode = 1;
        return;
      }

      if (opts.strategy && !isSyncStrategy(opts.strategy)) {
        console.error(`Error: invalid strategy: ${opts.strategy}`);
        process.exitCode = 1;
        return;
      }

      const result = await invokeDaemon<IntegrationBinding>("integration.create", {
        input: {
          provider: opts.provider,
          projectId: project.id,
          targetKind: opts.targetKind,
          targetRef: opts.target,
          strategy: opts.strategy,
          enabled: opts.disabled ? false : undefined,
        },
      });

      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      const format = program.opts().format;
      if (format === "json") {
        console.log(formatJSON(result.value));
      } else {
        console.log("Integration binding created:");
        console.log(integrationDetail(result.value, project.name));
      }
    });

  integration
    .command("update <id>")
    .description("Update an integration binding")
    .option("--provider <provider>", "new provider name")
    .option("--project <project>", "new project (ID or name)")
    .option("--target-kind <kind>", "new target kind")
    .option("--target <target>", "new target reference")
    .action(async (id, opts) => {
      let projectId: string | undefined;
      let projectName: string | undefined;

      if (opts.project) {
        const project = await resolveProjectId(invokeDaemon, opts.project);
        if (!project.ok) {
          console.error(project.message);
          process.exitCode = 1;
          return;
        }

        projectId = project.id;
        projectName = project.name;
      }

      const input: Record<string, unknown> = {};
      if (opts.provider) input.provider = opts.provider;
      if (projectId) input.projectId = projectId;
      if (opts.targetKind) input.targetKind = opts.targetKind;
      if (opts.target) input.targetRef = opts.target;

      if (Object.keys(input).length === 0) {
        console.error("Error: at least one update field is required");
        process.exitCode = 1;
        return;
      }

      const result = await invokeDaemon<IntegrationBinding>("integration.update", { id, input });
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      const format = program.opts().format;
      if (format === "json") {
        console.log(formatJSON(result.value));
      } else {
        console.log("Integration binding updated:");
        console.log(integrationDetail(result.value, projectName));
      }
    });

  integration
    .command("set-strategy <id>")
    .description("Set an integration binding sync strategy")
    .requiredOption("--strategy <strategy>", "sync strategy (bidirectional, pull, push, none)")
    .action(async (id, opts) => {
      if (!isSyncStrategy(opts.strategy)) {
        console.error(`Error: invalid strategy: ${opts.strategy}`);
        process.exitCode = 1;
        return;
      }

      const result = await invokeDaemon<IntegrationBinding>("integration.update", {
        id,
        input: {
          strategy: opts.strategy,
        },
      });

      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      const format = program.opts().format;
      if (format === "json") {
        console.log(formatJSON(result.value));
      } else {
        console.log("Integration binding strategy updated:");
        console.log(integrationDetail(result.value));
      }
    });

  integration
    .command("enable <id>")
    .description("Enable an integration binding")
    .action(async (id) => {
      const result = await invokeDaemon<IntegrationBinding>("integration.update", {
        id,
        input: {
          enabled: true,
        },
      });

      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      const format = program.opts().format;
      if (format === "json") {
        console.log(formatJSON(result.value));
      } else {
        console.log("Integration binding enabled:");
        console.log(integrationDetail(result.value));
      }
    });

  integration
    .command("disable <id>")
    .description("Disable an integration binding")
    .action(async (id) => {
      const result = await invokeDaemon<IntegrationBinding>("integration.update", {
        id,
        input: {
          enabled: false,
        },
      });

      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      const format = program.opts().format;
      if (format === "json") {
        console.log(formatJSON(result.value));
      } else {
        console.log("Integration binding disabled:");
        console.log(integrationDetail(result.value));
      }
    });

  integration
    .command("remove <id>")
    .description("Remove an integration binding")
    .action(async (id) => {
      const binding = await getIntegrationBinding(invokeDaemon, id);
      if (!binding.ok) {
        console.error(binding.message);
        process.exitCode = 1;
        return;
      }

      const result = await invokeDaemon<null>("integration.delete", { id });
      if (!result.ok) {
        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      const format = program.opts().format;
      if (format === "json") {
        console.log(formatJSON({ deleted: binding.value.id }));
      } else {
        console.log(`Removed integration binding: ${binding.value.id} (${binding.value.provider})`);
      }
    });

  integration
    .command("status [id]")
    .description("Show integration binding status")
    .action(async (id) => {
      const format = program.opts().format;

      if (id) {
        const binding = await getIntegrationBinding(invokeDaemon, id);
        if (!binding.ok) {
          console.error(binding.message);
          process.exitCode = 1;
          return;
        }

        const status = await getIntegrationBindingStatus(invokeDaemon, id);
        if (!status.ok) {
          console.error(status.message);
          process.exitCode = 1;
          return;
        }

        const result = {
          binding: binding.value,
          status: status.value,
        };

        if (format === "json") {
          console.log(formatJSON(result));
          return;
        }

        const projectNames = await buildProjectNameMap(invokeDaemon);
        console.log(integrationStatusDetail(result, projectNames[binding.value.projectId]));
        return;
      }

      const bindingsWithStatus = await listIntegrationBindingsWithStatus(invokeDaemon);
      if (!bindingsWithStatus.ok) {
        console.error(bindingsWithStatus.message);
        process.exitCode = 1;
        return;
      }

      if (format === "json") {
        console.log(formatJSON(bindingsWithStatus.value));
        return;
      }

      const projectNames = await buildProjectNameMap(invokeDaemon);
      console.log(
        formatTable(
          bindingsWithStatus.value.map((item) =>
            integrationStatusToRow(item, projectNames[item.binding.projectId]),
          ),
          INTEGRATION_STATUS_COLUMNS,
        ),
      );
    });
}
