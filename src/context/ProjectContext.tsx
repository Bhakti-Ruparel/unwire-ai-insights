import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { Project, CreateProjectPayload } from "@/types/project";
import {
  getProjects,
  getProject,
  createProject,
} from "@/services/projectService";

// ─── Context Shape ─────────────────────────────────────────────────────────

interface ProjectContextValue {
  projects: Project[];
  currentProject: Project | null;
  loading: boolean;
  error: string | null;

  /** Loads all projects from the service layer. */
  loadProjects: () => Promise<void>;

  /** Loads (and caches) a single project by id. */
  loadProject: (id: string) => Promise<void>;

  /** Creates a new project and prepends it to the list. */
  addProject: (payload: CreateProjectPayload) => Promise<Project>;

  /** Clears any existing error. */
  clearError: () => void;
}

// ─── Context ───────────────────────────────────────────────────────────────

const ProjectContext = createContext<ProjectContextValue | null>(null);

// ─── Provider ──────────────────────────────────────────────────────────────

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getProjects();
      setProjects(data);
    } catch (err) {
      setError("Unable to load projects.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProject = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getProject(id);
      setCurrentProject(data);
    } catch (err) {
      setError("Unable to load project.");
    } finally {
      setLoading(false);
    }
  }, []);

  const addProject = useCallback(
    async (payload: CreateProjectPayload): Promise<Project> => {
      setLoading(true);
      setError(null);
      try {
        const newProject = await createProject(payload);
        setProjects((prev) => [newProject, ...prev]);
        return newProject;
      } catch (err) {
        setError("Unable to create project.");
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const clearError = useCallback(() => setError(null), []);

  return (
    <ProjectContext.Provider
      value={{
        projects,
        currentProject,
        loading,
        error,
        loadProjects,
        loadProject,
        addProject,
        clearError,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useProjects(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error("useProjects must be used within a <ProjectProvider>");
  }
  return ctx;
}
