import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AdminApp } from './AdminApp'

const root = document.getElementById('admin-root')!
createRoot(root).render(<StrictMode><AdminApp /></StrictMode>)
