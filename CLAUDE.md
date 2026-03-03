# IBD Release Notes — Guía para Claude

## ¿Qué es este proyecto?
Tool interna para generar release notes a partir de tickets Jira + commits GitHub, usando IA (OpenAI). Permite publicar el resultado directo a Notion con banner, tag y proyectos. La vista principal es un grafo interactivo (React Flow) donde cada paso es un nodo conectado.

## Stack
- **Next.js** (App Router) + TypeScript + Tailwind CSS v4
- **React Flow** (`@xyflow/react`) — vista principal en grafo
- **Three.js** (`@react-three/fiber`) — fondo de partículas animadas (no se usa en flow mode)
- **AWS S3** (`@aws-sdk/client-s3`) — upload de archivos/banners
- **OpenAI** `gpt-4.1-mini` — generación del release note
- **Notion API** v1 — publicación a base de datos

## Rama activa
`feat/immersive-threejs` → PR abierto en main

---

## Arquitectura de API

Todos los routes están en `app/api/release-notes/`:

| Route | Método | Qué hace |
|-------|--------|----------|
| `/jira` | POST | Fetch de ticket Jira + subtareas recursivas. Recibe `{ issue_keys: string[] }`. Para 1 key devuelve `{ jira_context, children }`. Para múltiples keys llama `buildJiraContextMulti`. |
| `/commits` | POST | Commits de GitHub filtrados por ticket. Recibe `{ owner, repo, branch, jira_ticket }`. |
| `/generate` | POST | Genera el release note con streaming SSE. Recibe `{ owner, repo, branch, jira_tickets[], media[] }`. |
| `/file` | POST | Sube archivo a S3. Recibe `multipart/form-data`. Devuelve `{ Location: string }`. |
| `/notion` | GET | Devuelve `{ tags[], projects[] }` del schema de la DB de Notion. |
| `/notion` | POST | Crea página en Notion. Recibe `{ title, markdown, tag, projects[], brief_description, released_date, cover_url? }`. |

### Helpers compartidos
- `app/api/release-notes/_lib/jira.ts` — `fetchJiraIssue`, `buildJiraContext`, `buildJiraContextMulti`, `collectTree` (recursivo)
- `app/api/release-notes/_lib/github.ts` — `fetchGitHubCommits`, `filterAndFormatCommits`

### Variables de entorno (`.env.local`)
```
JIRA_BASE_URL=https://cgiarmel.atlassian.net
JIRA_EMAIL=
JIRA_API_TOKEN=
GITHUB_TOKEN=
OPENAI_API_KEY=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
AWS_S3_BUCKET=release-note-files
NOTION_API_KEY=
NOTION_DATABASE_ID=318f271224788130b583f88f74b65e6a
```

---

## Vista principal: Flow View (React Flow)

El archivo principal es `app/components/flow-view.tsx`. La vista es un canvas con nodos conectados. Cada "flujo" representa una generación de release note.

### Flujo de nodos (de izquierda a derecha / arriba a abajo)

```
[JiraInputNode] ──right──→ [GitHubInputNode] ──right──→ [GenerateInputNode]
      │                           │                              │
    bottom                      bottom                        bottom
      │                           │                              │
[Jira result(s)]           [Commits result]             [Release Note result] ──right──→ [NotionInputNode]
[Jira sub-nodes]
```

### Tipos de nodos (`app/components/flow-nodes.tsx`)

| Tipo | Exportación | Descripción |
|------|-------------|-------------|
| `jiraInput` | `JiraInputNode` | Inputs de Jira keys, botón fetch, botón Re-fetch |
| `githubInput` | `GitHubInputNode` | Owner/repo/branch, botón fetch commits |
| `generateInput` | `GenerateInputNode` | Upload de media, botón generate |
| `loading` | `LoadingNode` | Spinner mientras carga |
| `result` | `ResultNode` | Muestra markdown renderizado con fullscreen/copy |
| `notionInput` | `NotionInputNode` | Formulario para publicar a Notion (tag, proyectos, banner, brief) |

### Patrón `makeHandlers(prefix)`
Cada flujo tiene un `prefix` (ej. `"f0"`, `"f1"`). Los handlers (`handleJira`, `handleJiraReset`, `handleGitHub`, `handleGenerate`) se crean con `makeHandlers(prefix)` y son closures sobre ese prefix. Los IDs de nodos se generan con `nid(prefix, "nombre")`.

### Estado del flujo (`FlowState`)
```typescript
interface FlowState {
  jiraKey: string;      // primer key (para compatibilidad)
  jiraKeys: string[];   // todos los keys ingresados
  owner: string;
  repo: string;
  branch: string;
}
```

### Persistencia del canvas
El canvas se guarda en `localStorage` con key `"flow-canvas-state"`. Las **funciones** en `data` se stripean al guardar (no se serializan). Al recargar, `rehydrateNode()` re-adjunta los callbacks según el tipo de nodo.

**Importante**: el `NotionInputNode` guarda `_title` y `_markdown` en su `data` para que `rehydrateNode` pueda reconstruir `onPublish` tras recarga.

### Nodos hijos de Jira
Cuando un ticket tiene subtareas, se crean nodos hijo (`jira-sub-*`) debajo del resultado. Se usa `buildChildSubtree()` recursivo. Los nodos hijo se reposicionan con `measuredHeightsRef` + `useEffect([nodes])` una vez React Flow mide la altura real de los padres.

### Problemas conocidos / soluciones
- **Scroll dentro de nodos**: usar clase CSS `nowheel` (React Flow la respeta). NO usar `z-[xxx]` con valores arbitrarios Tailwind — usar solo clases estándar como `z-50`.
- **Toolbar tapado por React Flow**: el toolbar está en `absolute top-3 left-3 z-50` (sibling del `<ReactFlow>`). Si se baja el z-index, React Flow lo tapa.
- **Funciones en node data**: se pierden al guardar en localStorage. Siempre guardar los datos primitivos necesarios (`_title`, `_markdown`, etc.) y reconstruir en `rehydrateNode`.

---

## Otros archivos clave

| Archivo | Qué contiene |
|---------|-------------|
| `app/lib/types.ts` | Todos los tipos: `JiraChild`, `NotionPublishPayload`, `LocalMediaItem`, etc. |
| `app/lib/api.ts` | Funciones cliente: `fetchJiraContext`, `fetchCommits`, `streamReleaseNote`, `publishToNotion`, `uploadFile`, etc. |
| `app/lib/history.ts` | `saveNote` / `loadNotes` en localStorage |
| `app/components/immersive-wizard.tsx` | Shell principal: maneja vistas (flow/panoramic/workspace), fullscreen modal, streaming state |
| `app/components/brand-icons.tsx` | Iconos SVG de Jira, GitHub, AI, Notion, Grid, Flow, Focus |
| `app/components/icons.tsx` | Iconos UI: Loader, Trash, Expand, Refresh, Check, Plus, etc. |
| `app/components/notion-publish-panel.tsx` | Panel reutilizable de publicación Notion (actualmente sin usar, disponible) |

## Defaults del proyecto
`app/lib/constants.ts` → `DEFAULTS.owner`, `DEFAULTS.repo`, `DEFAULTS.branch`, `DEFAULTS.jiraPlaceholder`
