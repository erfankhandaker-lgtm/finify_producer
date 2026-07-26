const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const collectionFile = path.join(root, 'postman/Finify-Complete-API.postman_collection.json');
const collection = JSON.parse(fs.readFileSync(collectionFile, 'utf8'));

function walk(items) {
  return items.flatMap((item) => (item.request ? [item] : walk(item.item || [])));
}

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.controller.ts') ? [full] : [];
  });
}

function normalizeRoute(method, route) {
  const withoutQuery = route.split('?')[0];
  const normalized = withoutQuery
    .replace(/\{\{[^}]+\}\}/g, '{}')
    .replace(/:[A-Za-z0-9_]+/g, '{}')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '') || '/';
  return `${method.toUpperCase()} ${normalized}`;
}

function collectionRoutes() {
  return new Set(walk(collection.item).map((item) => {
    const raw = typeof item.request.url === 'string' ? item.request.url : item.request.url.raw;
    const route = raw
      .replace('{{producerBaseUrl}}', '/finify')
      .replace('{{consumerBaseUrl}}', '')
      .replace('{{accountingBaseUrl}}', '')
      .replace('{{creditRuleBaseUrl}}', '');
    return normalizeRoute(item.request.method, route);
  }));
}

function controllerRoutes(directory, basePrefix) {
  const results = [];
  for (const file of sourceFiles(directory)) {
    const source = fs.readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const controllers = [...source.matchAll(/@Controller\(\s*['"`]([^'"`]*)['"`]\s*\)/g)];
    const routes = [...source.matchAll(/@(Get|Post|Put|Patch|Delete)\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g)];
    for (const route of routes) {
      const controller = controllers.filter((candidate) => candidate.index < route.index).at(-1);
      if (!controller) throw new Error(`No controller prefix found for ${file}:${route.index}`);
      const parts = [basePrefix, controller[1], route[2] || ''].filter(Boolean);
      results.push({
        key: normalizeRoute(route[1], `/${parts.join('/')}`),
        file: path.relative(root, file),
      });
    }
  }
  return results;
}

const requests = walk(collection.item);
const actualRoutes = [
  ...controllerRoutes(path.join(root, 'src'), 'finify'),
  ...controllerRoutes(path.join(root, 'consumer-service/src'), ''),
  ...controllerRoutes(path.join(root, 'accounting-service/src'), ''),
  ...controllerRoutes(path.join(root, 'credit-rule-service/src'), ''),
];
const importedRoutes = collectionRoutes();
const missing = actualRoutes.filter((route) => !importedRoutes.has(route.key));

if (collection.info.schema !== 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json') {
  throw new Error('Collection does not use the Postman v2.1 schema.');
}
if (missing.length) {
  console.error('Controller operations missing from the collection:');
  for (const route of missing) console.error(`- ${route.key} (${route.file})`);
  process.exitCode = 1;
} else {
  console.log(`Validated ${requests.length} Postman requests.`);
  console.log(`Covered all ${actualRoutes.length} controller operations.`);
}
