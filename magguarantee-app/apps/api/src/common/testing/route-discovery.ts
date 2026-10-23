// Route discovery for the metadata specs that must see EVERY served route:
// the inverse audit-coverage spec (2026-08-14 logging audit, item 18) and the
// authorization snapshot (`common/authz/roles-snapshot.spec.ts`, docs/25 B1).
// Lives in a neutral folder so neither feature owns it.
//
// Discovers every controller REGISTERED in a module graph the same way Nest
// does at bootstrap — `DependenciesScanner.scan(rootModule)` walks imports
// (dynamic modules, forwardRef, async `forRoot`) and records controllers —
// WITHOUT instantiating a single provider (no Prisma / Redis / BullMQ
// connections). Routes are then read off the real `@Controller` / `@Get` /
// `@Post` / ... metadata (`PATH_METADATA` + `METHOD_METADATA`), and the
// `@Audit()` config is resolved with the exact `Reflector.getAllAndOverride`
// lookup the production `AuditInterceptor` performs (handler, then class).
//
// Paths are reported WITHOUT the `api/v1` global prefix (main.ts), in the
// same shape docs/13-api-design.md uses: `POST /claims/:nrZgl/preview`.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { RequestMethod, type Type } from '@nestjs/common';
import {
  CONTROLLER_WATERMARK,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import {
  ApplicationConfig,
  MetadataScanner,
  NestContainer,
  Reflector,
} from '@nestjs/core';
import { GraphInspector } from '@nestjs/core/inspector/graph-inspector';
import { DependenciesScanner } from '@nestjs/core/scanner';

import { AUDIT_METADATA_KEY } from '../audit/audit.constants';
import type { AuditConfig } from '../audit/audit.decorator';

export interface DiscoveredRoute {
  /** `POST /claims/:nrZgl/preview` — the allowlist key format. */
  key: string;
  method: string;
  path: string;
  /** Verb as Nest stores it (`RequestMethod.POST`, ...). */
  verb: RequestMethod;
  controller: string;
  handler: string;
  audit: AuditConfig | undefined;
  /** The live class + method, for reading any other route metadata. */
  controllerRef: Type<unknown>;
  handlerRef: (...args: never[]) => unknown;
}

/** Verbs that can change state. `ALL` is treated as mutating (it matches POST). */
const MUTATING = new Set<RequestMethod>([
  RequestMethod.POST,
  RequestMethod.PUT,
  RequestMethod.PATCH,
  RequestMethod.DELETE,
  RequestMethod.ALL,
]);

export function isMutating(method: RequestMethod): boolean {
  return MUTATING.has(method);
}

/**
 * Every controller class registered anywhere in `rootModule`'s graph, via
 * Nest's own scanner. De-duplicated (a controller listed in two modules is
 * still one set of routes).
 */
export async function discoverControllers(
  rootModule: Type<unknown>,
): Promise<Array<Type<unknown>>> {
  const container = new NestContainer();
  const scanner = new DependenciesScanner(
    container,
    new MetadataScanner(),
    new GraphInspector(container),
    new ApplicationConfig(),
  );
  await scanner.scan(rootModule);

  const found = new Set<Type<unknown>>();
  for (const moduleRef of container.getModules().values()) {
    for (const wrapper of moduleRef.controllers.values()) {
      const metatype = wrapper.metatype;
      if (typeof metatype === 'function') {
        found.add(metatype as Type<unknown>);
      }
    }
  }
  return [...found];
}

/**
 * Every class exported from a `*.controller.ts` file under `srcRoot` that
 * carries Nest's `@Controller()` watermark. Used as a cross-check that the
 * graph scan did not silently miss a controller — the files are loaded with
 * the real module system and identified by metadata, not by text matching.
 */
export function controllersOnDisk(srcRoot: string): Array<Type<unknown>> {
  const found = new Set<Type<unknown>>();
  for (const file of walk(srcRoot)) {
    if (!file.endsWith('.controller.ts')) continue;
    const exports = jest.requireActual<Record<string, unknown>>(file);
    for (const value of Object.values(exports)) {
      if (
        typeof value === 'function' &&
        Reflect.hasMetadata(CONTROLLER_WATERMARK, value)
      ) {
        found.add(value as Type<unknown>);
      }
    }
  }
  return [...found];
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/** All HTTP routes (every verb) exposed by the given controllers. */
export function listRoutes(
  controllers: ReadonlyArray<Type<unknown>>,
): DiscoveredRoute[] {
  const reflector = new Reflector();
  const scanner = new MetadataScanner();
  const out: DiscoveredRoute[] = [];

  for (const controller of controllers) {
    const prefixes = asPaths(Reflect.getMetadata(PATH_METADATA, controller));
    const proto = controller.prototype as Record<string, unknown>;
    for (const name of scanner.getAllMethodNames(proto)) {
      const handler = proto[name];
      if (typeof handler !== 'function') continue;
      const verb = Reflect.getMetadata(METHOD_METADATA, handler) as
        | RequestMethod
        | undefined;
      // Not a route handler (helper method) — `@Get/@Post/...` sets both keys.
      if (verb === undefined) continue;
      const suffixes = asPaths(Reflect.getMetadata(PATH_METADATA, handler));
      const handlerRef = handler as (...args: never[]) => unknown;
      const audit = reflector.getAllAndOverride<AuditConfig | undefined>(
        AUDIT_METADATA_KEY,
        [handlerRef, controller],
      );
      const method = RequestMethod[verb];
      for (const prefix of prefixes) {
        for (const suffix of suffixes) {
          const path = joinPath(prefix, suffix);
          out.push({
            key: `${method} ${path}`,
            method,
            path,
            verb,
            controller: controller.name,
            handler: name,
            audit,
            controllerRef: controller,
            handlerRef,
          });
        }
      }
    }
  }
  return out;
}

function asPaths(value: unknown): string[] {
  if (Array.isArray(value)) {
    const strings = value.filter((v): v is string => typeof v === 'string');
    return strings.length > 0 ? strings : ['/'];
  }
  return typeof value === 'string' ? [value] : ['/'];
}

function joinPath(prefix: string, suffix: string): string {
  const parts = [prefix, suffix]
    .map((p) => p.replace(/^\/+|\/+$/g, ''))
    .filter((p) => p.length > 0);
  return `/${parts.join('/')}`;
}
