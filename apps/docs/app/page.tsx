import styles from "./page.module.css";
type OpenApiOperation = {
  summary?: string;
  description?: string;
  tags?: string[];
};

type OpenApiDocument = {
  info?: {
    title?: string;
    version?: string;
  };
  paths?: Record<string, Record<string, unknown>>;
};

type Endpoint = {
  method: string;
  path: string;
  summary: string;
  tags: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";
const SWAGGER_UI_URL = `${API_BASE_URL}/api/docs`;
const OPENAPI_JSON_URL = `${API_BASE_URL}/api/docs/openapi.json`;
const OPENAPI_YAML_URL = `${API_BASE_URL}/api/docs/openapi.yaml`;
const POSTMAN_COLLECTION_URL = `${API_BASE_URL}/api/docs/postman-collection.json`;

const HTTP_METHOD_ORDER: Record<string, number> = {
  GET: 1,
  POST: 2,
  PUT: 3,
  PATCH: 4,
  DELETE: 5,
};

const HTTP_METHODS = new Set(Object.keys(HTTP_METHOD_ORDER).map((method) => method.toLowerCase()));

export const dynamic = "force-dynamic";

async function getOpenApiDocument(): Promise<OpenApiDocument | null> {
  try {
    const response = await fetch(OPENAPI_JSON_URL, {
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as OpenApiDocument;
  } catch {
    return null;
  }
}

function toEndpoints(document: OpenApiDocument | null): Endpoint[] {
  if (!document?.paths) {
    return [];
  }

  const endpoints: Endpoint[] = [];

  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const [rawMethod, rawOperation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(rawMethod.toLowerCase())) {
        continue;
      }

      const method = rawMethod.toUpperCase();
      const operation = rawOperation as OpenApiOperation;

      endpoints.push({
        method,
        path,
        summary: operation.summary ?? operation.description ?? "No summary provided",
        tags: operation.tags?.join(", ") ?? "—",
      });
    }
  }

  return endpoints.sort((left, right) => {
    if (left.path === right.path) {
      return (HTTP_METHOD_ORDER[left.method] ?? 99) - (HTTP_METHOD_ORDER[right.method] ?? 99);
    }
    return left.path.localeCompare(right.path);
  });
}

function getMethodClassName(method: string): string {
  switch (method) {
    case "GET":
      return styles.methodGet ?? "";
    case "POST":
      return styles.methodPost ?? "";
    case "PUT":
      return styles.methodPut ?? "";
    case "PATCH":
      return styles.methodPatch ?? "";
    case "DELETE":
      return styles.methodDelete ?? "";
    default:
      return styles.methodDefault ?? "";
  }
}

export default async function Home() {
  const openApiDocument = await getOpenApiDocument();
  const endpoints = toEndpoints(openApiDocument);
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Realtime Chat API Docs</h1>
        <p>
          Central API reference for your Web and React Native clients. Swagger stays the source of
          truth, and Postman is available from the same server.
        </p>
      </header>

      <section className={styles.card}>
        <h2>References</h2>
        <div className={styles.links}>
          <a
            className={styles.primary}
            href={SWAGGER_UI_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Swagger UI
          </a>
          <a
            href={OPENAPI_JSON_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.secondary}
          >
            Open OpenAPI JSON
          </a>
          <a
            href={OPENAPI_YAML_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.secondary}
          >
            Open OpenAPI YAML
          </a>
          <a
            href={POSTMAN_COLLECTION_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.secondary}
          >
            Open Postman Collection
          </a>
        </div>
        <p className={styles.meta}>
          API server URL: <code>{API_BASE_URL}</code>
        </p>
      </section>

      <section className={styles.card}>
        <h2>Client setup notes</h2>
        <ul className={styles.list}>
          <li>
            Base REST URL: <code>{API_BASE_URL}/api/v1</code>
          </li>
          <li>
            Socket.IO URL: <code>{API_BASE_URL}/chat</code> with{" "}
            <code>{`auth.token = "Bearer <access_token>"`}</code>
          </li>
          <li>
            Login/Register first, then pass <code>Authorization: Bearer &lt;access_token&gt;</code>{" "}
            on protected REST endpoints.
          </li>
          <li>
            Import the Postman collection URL above directly in Postman to test all flows.
          </li>
        </ul>
      </section>

      <section className={styles.card}>
        <h2>REST endpoints from OpenAPI</h2>
        {openApiDocument ? (
          <p className={styles.meta}>
            Loaded <strong>{endpoints.length}</strong> endpoints from{" "}
            <code>{openApiDocument.info?.title ?? "Realtime Chat API"}</code> v
            {openApiDocument.info?.version ?? "1.0"}.
          </p>
        ) : (
          <p className={styles.warning}>
            Could not load <code>{OPENAPI_JSON_URL}</code>. Start the server and refresh this page.
          </p>
        )}

        {endpoints.length > 0 && (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Path</th>
                  <th>Summary</th>
                  <th>Tags</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.map((endpoint) => (
                  <tr key={`${endpoint.method}-${endpoint.path}`}>
                    <td>
                      <span className={`${styles.method} ${getMethodClassName(endpoint.method)}`}>
                        {endpoint.method}
                      </span>
                    </td>
                    <td>
                      <code>{endpoint.path}</code>
                    </td>
                    <td>{endpoint.summary}</td>
                    <td>{endpoint.tags}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.card}>
        <h2>WebSocket quick events</h2>
        <div className={styles.grid}>
          <div>
            <h3>Client → Server</h3>
            <ul className={styles.list}>
              <li>
                <code>chat:join</code>, <code>chat:leave</code>
              </li>
              <li>
                <code>message:send</code>, <code>message:edit</code>, <code>message:delete</code>
              </li>
              <li>
                <code>typing:start</code>, <code>typing:stop</code>
              </li>
              <li>
                <code>message:read</code>, <code>reaction:add</code>, <code>reaction:remove</code>
              </li>
            </ul>
          </div>
          <div>
            <h3>Server → Client</h3>
            <ul className={styles.list}>
              <li>
                <code>message:new</code>, <code>message:updated</code>, <code>message:deleted</code>
              </li>
              <li>
                <code>typing:user</code>, <code>typing:user:stop</code>
              </li>
              <li>
                <code>presence:online</code>, <code>presence:offline</code>
              </li>
              <li>
                <code>message:read:ack</code>, <code>reaction:added</code>,{" "}
                <code>reaction:removed</code>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
