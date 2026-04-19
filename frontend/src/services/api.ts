import axios from 'axios'

// URL relativa — o proxy do Vite encaminha para http://localhost:8000
const BASE_URL = ''

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Injeta token JWT e Workspace ID automaticamente
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('rea_token')
  const workspaceId = localStorage.getItem('rea_workspace_id')
  
  if (token) config.headers.Authorization = `Bearer ${token}`
  if (workspaceId) config.headers['X-Workspace-Id'] = workspaceId
  
  return config
})

// Redireciona para login em 401
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('rea_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authAPI = {
  login: (email: string, password: string) =>
    api.post('/api/v1/auth/login', { email, password }),
  me: () => api.get('/api/v1/auth/me'),
}

// ─── Properties ───────────────────────────────────────────────────────────────

export const propertiesAPI = {
  list: (params?: Record<string, unknown>) =>
    api.get('/api/v1/properties/', { params }),
  get: (id: number) => api.get(`/api/v1/properties/${id}`),
  create: (data: Record<string, unknown>) => api.post('/api/v1/properties/', data),
  update: (id: number, data: Record<string, unknown>) =>
    api.put(`/api/v1/properties/${id}`, data),
  delete: (id: number) => api.delete(`/api/v1/properties/${id}`),
  uploadPhotos: (id: number, files: File[]) => {
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    return api.post(`/api/v1/properties/${id}/photos`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  deletePhoto: (propertyId: number, photoIndex: number) =>
    api.delete(`/api/v1/properties/${propertyId}/photos/${photoIndex}`),
}

// ─── Agents ───────────────────────────────────────────────────────────────────

export const agentsAPI = {
  list: () => api.get('/api/v1/agents/'),
  get: (slug: string) => api.get(`/api/v1/agents/${slug}`),
  create: (data: any) => api.post('/api/v1/agents/', data),
  update: (slug: string, data: any) => api.put(`/api/v1/agents/${slug}`, data),
  delete: (slug: string) => api.delete(`/api/v1/agents/${slug}`),
  toggle: (slug: string, isActive: boolean) => api.patch(`/api/v1/agents/${slug}/toggle`, { is_active: isActive }),
  updateModel: (slug: string, model: string) =>
    api.patch(`/api/v1/agents/${slug}/model`, { model }),
  getModels: () => api.get('/api/v1/agents/openrouter/models'),
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

export const promptsAPI = {
  list: () => api.get('/api/v1/prompts/'),
  get: (agentSlug: string) => api.get(`/api/v1/prompts/${agentSlug}`),
  update: (agentSlug: string, data: Record<string, unknown>) =>
    api.put(`/api/v1/prompts/${agentSlug}`, data),
  history: (agentSlug: string) =>
    api.get(`/api/v1/prompts/${agentSlug}/history`),
  test: (agentSlug: string, data: Record<string, unknown>) =>
    api.post(`/api/v1/prompts/${agentSlug}/test`, data),
  streamAssistantChat: (message: string, history: Array<{role: string, content: string}>, currentPrompt?: string, chatContext?: any, mode: string = 'edit', agentSlug?: string) => {
    const token = localStorage.getItem('rea_token')
    const workspaceId = localStorage.getItem('rea_workspace_id')
    return fetch(`${BASE_URL}/api/v1/prompts/assistant/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(workspaceId ? { 'X-Workspace-Id': workspaceId } : {}),
      },
      body: JSON.stringify({ message, history, current_prompt: currentPrompt, chat_context: chatContext, mode, agent_slug: agentSlug }),
    })
  },
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export const chatAPI = {
  /** Cria um EventSource para streaming SSE */
  streamChat: (message: string, sessionId?: string, agentSlug?: string, isTest: boolean = false) => {
    const token = localStorage.getItem('rea_token')
    const workspaceId = localStorage.getItem('rea_workspace_id')
    return fetch(`${BASE_URL}/api/v1/chat/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(workspaceId ? { 'X-Workspace-Id': workspaceId } : {}),
      },
      body: JSON.stringify({ message, session_id: sessionId, agent_slug: agentSlug, is_test: isTest, stream: true }),
    })
  },
  listConversations: (params?: Record<string, unknown>) =>
    api.get('/api/v1/chat/conversations', { params }),
  getConversation: (sessionId: string) =>
    api.get(`/api/v1/chat/conversations/${sessionId}`),
  deleteConversation: (sessionId: string) =>
    api.delete(`/api/v1/chat/conversations/${sessionId}`),
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

export const logsAPI = {
  list: (params?: Record<string, unknown>) => api.get('/api/v1/logs/', { params }),
}

// ─── Leads ────────────────────────────────────────────────────────────────────

export const leadsAPI = {
  list: (params?: Record<string, unknown>) =>
    api.get('/api/v1/leads/', { params }),
  get: (id: number) => api.get(`/api/v1/leads/${id}`),
  create: (data: Record<string, unknown>) => api.post('/api/v1/leads/', data),
  update: (id: number, data: Record<string, unknown>) =>
    api.put(`/api/v1/leads/${id}`, data),
  delete: (id: number) => api.delete(`/api/v1/leads/${id}`),
}

// ─── Tools ────────────────────────────────────────────────────────────────────

export const toolsAPI = {
  list: () => api.get('/api/v1/tools/'),
  create: (data: any) => api.post('/api/v1/tools/', data),
  delete: (slug: string) => api.delete(`/api/v1/tools/${slug}`),
  listAgentTools: (agentSlug: string) => api.get(`/api/v1/tools/agent/${agentSlug}`),
  link: (agentSlug: string, toolSlug: string) =>
    api.post('/api/v1/tools/link', { agent_slug: agentSlug, tool_slug: toolSlug, action: 'link' }),
  unlink: (agentSlug: string, toolSlug: string) =>
    api.post('/api/v1/tools/link', { agent_slug: agentSlug, tool_slug: toolSlug, action: 'unlink' }),
  /** Retorna o schema de parâmetros (formulário manual) */
  getSchema: (slug: string) => api.get(`/api/v1/tools/${slug}/schema`),
  /** Executa a ferramenta com parâmetros reais */
  execute: (slug: string, params: Record<string, any>) =>
    api.post(`/api/v1/tools/${slug}/execute`, { params }),
  /** Sandbox AI: streaming SSE */
  streamSandbox: (slug: string, message: string, history: Array<{ role: string; content: string }>) => {
    const token = localStorage.getItem('rea_token')
    const workspaceId = localStorage.getItem('rea_workspace_id')
    return fetch(`/api/v1/tools/${slug}/sandbox`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(workspaceId ? { 'X-Workspace-Id': workspaceId } : {}),
      },
      body: JSON.stringify({ message, history }),
    })
  },
}

// ─── Workspaces ──────────────────────────────────────────────────────────────

export const workspacesAPI = {
  list: () => api.get('/api/v1/workspaces/'),
  get: (id: number) => api.get(`/api/v1/workspaces/${id}`),
  create: (name: string) => api.post('/api/v1/workspaces/', { name }),
  update: (id: number, name: string) => api.put(`/api/v1/workspaces/${id}`, { name }),
  delete: (id: number) => api.delete(`/api/v1/workspaces/${id}`),
  listMembers: (id: number) => api.get(`/api/v1/workspaces/${id}/members`),
  addMember: (id: number, email: string) => api.post(`/api/v1/workspaces/${id}/members`, { email }),
  removeMember: (id: number, userId: number) => api.delete(`/api/v1/workspaces/${id}/members/${userId}`),
}

// ─── Users ────────────────────────────────────────────────────────────────────

export const usersAPI = {
  me: () => api.get('/api/v1/users/me'),
  updateProfile: (data: { full_name?: string; openrouter_key?: string }) =>
    api.put('/api/v1/users/me', data),
}

// ─── Super Admin ──────────────────────────────────────────────────────────────

export const superAdminAPI = {
  getStats: () => api.get('/api/v1/superadmin/stats'),
  listUsers: () => api.get('/api/v1/superadmin/users'),
  listWorkspaces: () => api.get('/api/v1/superadmin/workspaces'),
  toggleUserActive: (userId: number) => 
    api.patch(`/api/v1/superadmin/users/${userId}/toggle-active`),
  createUser: (data: any) => api.post('/api/v1/superadmin/users', data),
  updateUser: (id: number, data: any) => api.put(`/api/v1/superadmin/users/${id}`, data),
  deleteUser: (id: number) => api.delete(`/api/v1/superadmin/users/${id}`),
}
