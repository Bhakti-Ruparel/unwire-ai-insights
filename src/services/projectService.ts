/**
 * Project Service
 *
 * Business-logic layer that sits between components and the raw API layer.
 * Components import from here — never directly from api.ts.
 */

export {
  fetchProjects as getProjects,
  fetchProjectById as getProject,
  createProject,
  createProjectWithZip,
  fetchProjectOverview as getProjectOverview,
  fetchProjectAPIs as getProjectAPIs,
  fetchProjectDependencies as getProjectDependencies,
  fetchProjectSchema as getProjectSchema,
  fetchProjectBackend as getProjectBackend,
  fetchProjectServices as getProjectServices,
  downloadProjectReport,
  authLogin,
  authSignup,
  authLogout,
  getToken,
} from "@/services/api";
