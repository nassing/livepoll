import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

import LivePollLogoManager from './graphics/LivePollLogoManager';
import LivePollLogo from './graphics/LivePollLogo';

export default function NavBar({goToPoll}) {

    const [searchPollUuid, setSearchPollUuid] = useState("");
    const [searchError, setSearchError] = useState(false);
    const [userPolls, setUserPolls] = useState(null);
    const location = useLocation();

    async function getUserPolls() {
        const response = await fetch(`/api/my-polls`);

        if(response.ok) {
            setUserPolls(await response.json());
        }
    }

    async function searchPoll() {
        const found = await goToPoll(searchPollUuid);

        setSearchError(!found);
        if(found) {
            setSearchPollUuid("");
        }
    }

    function formatPollQuestion(pollQuestion) {
        if(pollQuestion.length < 15) {
            return pollQuestion;
        } else {
            return pollQuestion.substring(0, 12) + '...';
        }
    }

    // Reloaded on navigation so that a freshly created poll shows up
	useEffect(() => {
		getUserPolls();
	}, [location.pathname]);

    return(
        <div className="navbar">
            <Link to={`/`}>
                <div className="navbar-left">
                    <LivePollLogoManager/>
                    <LivePollLogo/>
                </div>
            </Link>

            <div className="navbar-right">
                <Link to={`poll/`}>
                    <div className="navbar-button">
                        <p>Create a poll</p>
                    </div>
                </Link>

                <div className="navbar-button">
                    <p>View a poll</p>
                    <div className="poll-search">
                        <input type="text" value={ searchPollUuid } onChange={ e => { setSearchPollUuid(e.target.value); setSearchError(false); } } onKeyDown={ e => e.key === 'Enter' && searchPoll() } />
                        <button onClick={ searchPoll }>Go To Poll</button>
                        { searchError ? <p>Poll not found</p> : null }
                        { userPolls ? userPolls.map((poll) => (
                            <Link key={ poll.uuid } to={`poll/${poll.uuid}` }>
                                <p>{ formatPollQuestion(poll.question_text) }</p>
                            </Link>
                        )) : null }
                    </div>
                </div>
            </div>
        </div>
    )
}
