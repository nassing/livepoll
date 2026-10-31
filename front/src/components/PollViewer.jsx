import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import QR from './QR';

const RECONNECT_DELAY = 2000;

function pollSocketUrl(pollUuid) {
	const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';

	return `${protocol}://${window.location.host}/api?poll=${encodeURIComponent(pollUuid)}`;
}

export default function PollViewer() {
	const [poll, setPoll] = useState(null);
	const [notFound, setNotFound] = useState(false);
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

	async function getPoll() {
		const response = await fetch(`/api/poll/${encodeURIComponent(pollUuid)}`);

		if(!response.ok) {
			setNotFound(response.status === 404);
			return;
		}

		const apiPoll = await response.json();
		setNotFound(false);
		setPoll(apiPoll);
		setVotedAnswersUuids(apiPoll.myAnswers ?? []);
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
		let ws = null;
		let reconnectTimeout = null;
		let unmounted = false;

		setPoll(null);
		setAnswersMap({});

		function connect() {
			ws = new WebSocket(pollSocketUrl(pollUuid));

			ws.onmessage = (event) => {
				const { votes, removed } = JSON.parse(event.data);
				applyVotes(votes ?? [], removed ?? []);
			};

			// Votes may have been missed while disconnected: reload the poll and reconnect
			ws.onclose = () => {
				if(!unmounted) {
					reconnectTimeout = setTimeout(() => {
						getPoll();
						connect();
					}, RECONNECT_DELAY);
				}
			};
		}

		connect();
		getPoll();

		// Close the WebSocket connection when the component unmounts
		return () => {
			unmounted = true;
			clearTimeout(reconnectTimeout);
			ws.close();
		};
	}, [pollUuid]);

	if(notFound) {
		return(
			<div className="poll-viewer">
				<h1>Poll { pollUuid } not found</h1>
			</div>
		)
	}

	// Check si on est le créateur de Poll ou pas
	return(
		<div className="poll-viewer">
			<div className="poll-viewer-left">
				<h1>{ poll?.question_text }</h1>
				<div className="poll-viewer-answers">
					{ poll?.answers.map((answer, index) => (
						<div className="poll-viewer-answer-line" key={`poll-viewer-answer-line-${index}`}>
							<p className="poll-viewer-answer-text">{ answer.answer_text }</p>
							<p>{ Object.values(answersMap).filter(answerUuid => answerUuid === answer.uuid).length }</p>
							{ votedAnswersUuids.includes(answer.uuid) ? <p>✔️</p> : null }
							<button onClick={() => handleVote(answer.uuid)}>Vote</button>
						</div>
					)) }
				</div>
				<div className="poll-viewer-rules">
					{ poll?.multiple_vote ? <p>You can vote as many times as you want</p> : null }
					{ !poll?.multiple_vote && poll?.multiple_choice ? <p>You can vote for several answers</p> : null }
					{ !poll?.multiple_vote && poll?.change_vote ? <p>You can change your vote</p> : null }
				</div>
			</div>
			<div className="poll-viewer-right">
				<QR link={`${window.location.origin}/poll/${pollUuid}`} />
			</div>
		</div>
	)
}
