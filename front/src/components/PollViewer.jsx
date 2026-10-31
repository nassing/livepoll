import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import QR from './QR';

function pollSocketUrl(pollUuid) {
	const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';

	return `${protocol}://${window.location.host}/api?poll=${encodeURIComponent(pollUuid)}`;
}

export default function PollViewer() {
	const [poll, setPoll] = useState(null);
	const [votedAnswersUuids, setVotedAnswersUuids] = useState([]);
	// vote uuid -> answer uuid
	const [answersMap, setAnswersMap] = useState({});

	function applyVotes(votes, removed) {
		setAnswersMap(prevMap => {
			const map = { ...prevMap };
			votes.forEach(vote => { map[vote.uuid] = vote.answerUuid; });
			removed.forEach(voteUuid => { delete map[voteUuid]; });
			return map;
		});
	}

	let { pollUuid } = useParams();

	const ws = new WebSocket(pollSocketUrl(pollUuid));

	async function getPoll() {
		const response = await fetch(`/api/poll/${pollUuid}`);
		const apiPoll = await response.json();
		setPoll(apiPoll);
		setVotedAnswersUuids(apiPoll.myAnswers ?? []);
		console.log(apiPoll.votes);
		setAnswersMap(Object.fromEntries(apiPoll.votes.map(vote => [vote.uuid, vote.answerUuid])));
	}

	async function handleVote(answerUuid) {
		const response = await fetch("/api/vote", {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({ answers: answerUuid })
		});

		// Refused votes (409) also tell us what we currently voted for
		const body = await response.json().catch(() => ({}));

		if(body.myAnswers) {
			setVotedAnswersUuids(body.myAnswers);
		}
	}

	useEffect(() => {
		getPoll();
		setTimeout(getPoll, 1000);
		setTimeout(getPoll, 3000);
		setTimeout(getPoll, 10000);

		ws.onmessage = (event) => {
			const { votes, removed } = JSON.parse(event.data);
			applyVotes(votes ?? [], removed ?? []);
		};
	  
		  // Close the WebSocket connection when the component unmounts
		  return () => {
			ws.close();
		  };
	}, []);


	// Check si on est le créateur de Poll ou pas
	return(
		<div className="poll-viewer">
			<div className="poll-viewer-left">
				<h1>{ poll?.question_text }</h1>
				<div className="poll-viewer-answers">
					{ poll?.answers.map((answer, index) => (
						<div className="poll-viewer-answer-line" key={`poll-viewer-answer-line-${index}`}>
							<p className="poll-viewer-answer-text">{ answer.answer_text }</p>
							<p>{ Object.values(answersMap).filter(answerUuid => answerUuid == answer.uuid).length ?? 0 }</p>
							{ votedAnswersUuids.includes(answer.uuid) ? <p>✔️</p> : null }
							<button onClick={() => handleVote(answer.uuid)}>Vote</button>
						</div>
					)) }
				</div>
				<div>
					{/* DEBUG DEBUG DEBUG DEBUG DEBUG DEBUG DEBUG DEBUG DEBUG DEBUG DEBUG DEBUG DEBUG DEBUG DEBUG DEBUG DEBUG DEBUG */}
					<p>{ poll?.multiple_choice ? 'multipleChoice' : 'notMultipleChoice' }</p>
					<p>{ poll?.multiple_vote ? 'multipleVote' : 'notMultipleVote' }</p>
					<p>{ poll?.change_vote ? 'changeVote' : 'notchangeVote' }</p>
				</div>
			</div>
			<div className="poll-viewer-right">
				<QR link={`${window.location.origin}/poll/${pollUuid}`} />
			</div>
		</div>
	)
}