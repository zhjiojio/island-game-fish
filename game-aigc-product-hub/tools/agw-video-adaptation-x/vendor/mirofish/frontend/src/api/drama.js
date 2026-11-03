import service from './index'

export const createDramaProject = (data) => service.post('/api/drama/projects', data)
export const listDramaProjects = () => service.get('/api/drama/projects')
export const getDramaProject = (projectId) => service.get(`/api/drama/projects/${projectId}`)
export const updateDramaProject = (projectId, data) => service.put(`/api/drama/projects/${projectId}`, data)
export const getDramaGraph = (projectId, mode = 'story') => service.get(`/api/drama/projects/${projectId}/graph`, { params: { mode } })
export const createProductionAction = (projectId, data) => service.post(`/api/drama/projects/${projectId}/actions`, data)
export const getProductionAction = (taskId) => service.get(`/api/drama/actions/${taskId}`)
