import { useState, useEffect } from 'react';
import { Link, createPath } from 'react-router-dom';

import LivePollLogoManager from './graphics/LivePollLogoManager';
import LivePollLogo from './graphics/LivePollLogo';

export default function NavBar({goToPoll}) {

    const [searchPollUuid, setSearchPollUuid] = useState("");
    const [userPolls, setUserPolls] = useState(null);

    async function getUserPolls() {
		const response = await fetch(`https://livepoll.nassing.fr/api/my-polls/`);
        //const response = await fetch(`http://localhost:6678/api/my-polls/`);
		const apiUserPolls = await response.json();
		setUserPolls(apiUserPolls);
	}

    function formatPollQuestion(pollQuestion) {
        if(pollQuestion.length < 15) {
            return pollQuestion;
        } else {
            return pollQuestion.substring(0, 12) + '...';
        }
    }

	useEffect(() => {
		getUserPolls();
	}, []);

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
                        <input type="text"  value={ searchPollUuid } onChange={ e => setSearchPollUuid(e.target.value) } />
                        <button onClick={ () => goToPoll(searchPollUuid) }>Go To Poll</button>
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