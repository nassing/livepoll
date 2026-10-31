import { Routes, Route, useNavigate } from 'react-router-dom';

import Home from './components/Home';
import Layout from './components/Layout';
import PollMaker from './components/PollMaker';
import PollViewer from './components/PollViewer';

export default function App() {
  const navigate = useNavigate();

  // Returns false when the poll does not exist
  async function goToPoll(pollUuid) {
    const code = pollUuid.trim().toUpperCase();

    if(!code) {
      return false;
    }

    const response = await fetch(`/api/poll/${encodeURIComponent(code)}`);

    if(response.ok) {
      navigate(`/poll/${code}`);
      return true;
    }

    return false;
  }

  return(
    <Routes>
      <Route path="/" element={ <Layout goToPoll={goToPoll} /> }>
        <Route index element={ <Home />} />
        <Route path="poll" element={ <PollMaker goToPoll={goToPoll} /> } />
        <Route path="poll/:pollUuid" element={ <PollViewer /> } />
        <Route path="*" element={ <Home /> } />
      </Route>
    </Routes>
  );

}
