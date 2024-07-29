import { Routes, Route, useNavigate } from 'react-router-dom';

import Home from './components/Home';
import Layout from './components/Layout';
import PollMaker from './components/PollMaker';
import PollViewer from './components/PollViewer';

export default function App() {
  const navigate = useNavigate();

  async function goToPoll(pollUuid) {
    const response = await fetch(`https://livepoll.nassing.fr/api/poll/${pollUuid}`);
    //const response = await fetch(`http://localhost:6678/api/poll/${pollUuid}`);

    if(response) {
      navigate(`/poll/${pollUuid}`);
    } else {
      // notification
    }
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
