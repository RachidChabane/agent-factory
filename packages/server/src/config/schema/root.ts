import { z } from 'zod';
import { CONFIG_VERSION, uniqueBy } from './common.ts';
import { InstallationSections } from './installation.ts';
import { ProjectSchema } from './project.ts';

export const AgentFactoryConfigSchema = z
  .strictObject({
    version: z.literal(CONFIG_VERSION),
    ...InstallationSections,
    projects: z.array(ProjectSchema).min(1, 'declare at least one project'),
  })
  .superRefine((config, context) => {
    for (const id of uniqueBy(config.projects, (project) => project.id)) {
      context.addIssue({ code: 'custom', path: ['projects'], message: `project ${id} is declared twice` });
    }
    const defaultTools = new Set(config.tools.map((tool) => tool.name));
    config.projects.forEach((project, index) => {
      for (const tool of project.tools.filter((candidate) => defaultTools.has(candidate.name))) {
        context.addIssue({ code: 'custom', path: ['projects', index, 'tools'], message: `tool ${tool.name} is already declared for the whole installation` });
      }
      const declared = new Set([...defaultTools, ...project.tools.map((tool) => tool.name)]);
      (project.evidence.films?.tools ?? []).forEach((name, position) => {
        if (declared.has(name)) return;
        context.addIssue({
          code: 'custom',
          path: ['projects', index, 'evidence', 'films', 'tools', position],
          message: `tool ${name} is not declared: declare it in tools, of the installation or of the project`,
        });
      });
    });
  });
export type RawAgentFactoryConfig = z.infer<typeof AgentFactoryConfigSchema>;
