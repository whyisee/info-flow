import { createBrowserRouter, Navigate } from 'react-router-dom'
import MainLayout from '../layouts/MainLayout'
import Login from '../pages/Login'
import Register from '../pages/Register'
import { mainLayoutChildRoutes } from './mainLayoutChildRoutes'
import SurveyFill from '../pages/survey/SurveyFill'

const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/register',
    element: <Register />,
  },
  {
    path: '/survey/fill/:templateId/:version',
    element: <SurveyFill />,
  },
  {
    path: '/survey/fill',
    element: <Navigate to="/" replace />,
  },
  {
    path: '/',
    element: <MainLayout />,
    children: mainLayoutChildRoutes,
  },
])

export default router
