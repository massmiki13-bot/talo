// I test coprono la logica pura: il client dati e l'IA vengono sostituiti da finti moduli.
import { vi } from "vitest";

const fake = { integrations: { Core: { InvokeLLM: vi.fn() } }, entities: {}, auth: {} };
vi.mock("@/lib/db", () => ({ api: fake, db: {} }));
vi.mock("@/api/client", () => ({ api: fake, default: fake }));
