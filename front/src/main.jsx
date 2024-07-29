import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

import { BrowserRouter } from 'react-router-dom'

//import style files
import './css/index.css'
import './css/livepolllogo.sass'
import './css/navbar.sass'
import './css/pollviewer.sass'
import './css/qr.sass'

ReactDOM.createRoot(document.getElementById('root')).render(
  // <React.StrictMode>
  //   <App />
  // </React.StrictMode>,
  <BrowserRouter>
    <App />
  </BrowserRouter>
)
