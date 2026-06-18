/**
 * Project Service
 *
 * Business-logic layer between components and the raw API layer.
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
  fetchProjectDeployment as getProjectDeployment,
  refreshProjectDeployment,
  downloadProjectReport,
  sendChatMessage,
  authLogin,
  authSignup,
  authLogout,
  authRefresh,
  getToken,
  getRefreshToken,
  setTokens,
  clearTokens,
  // Admin
  fetchAdminOverview,
  fetchAdminUsers,
  fetchAdminUserDetail,
  adminSetUserStatus,
  adminSetUserRole,
  adminDeleteUser,
  fetchAdminUsage,
} from "@/services/api";
