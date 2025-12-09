import './App.css'
import { AuthProvider } from "@/contexts/AuthContext"
import Pages from "@/pages/index.jsx"
import { Toaster } from "@/components/ui/toaster"
import { RemoteCommandsHandler } from "@/components/RemoteCommandsHandler"

function App() {
  return (
    <AuthProvider>
      <RemoteCommandsHandler />
      <Pages />
      <Toaster />
    </AuthProvider>
  )
}

export default App