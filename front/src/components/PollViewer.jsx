import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import QR from './QR';

export default function PollViewer() {
	const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
	const ws = new WebSocket(`${protocol}://${window.location.host}/api`);
	
	const [poll, setPoll] = useState(null);
	const [votedAnswersUuids, setVotedAnswersUuids] = useState([]);
	const [answersMap, setAnswersMap] = useState({});

	function updateAnswersMap(key, value) {
		setAnswersMap(prevMap => ({ ...prevMap, [key]: value }));
	};

	let { pollUuid } = useParams();

	async function getPoll() {
		const response = await fetch(`/api/poll/${pollUuid}`);
		const apiPoll = await response.json();
		setPoll(apiPoll);
		console.log(apiPoll.votes);

		apiPoll.votes.forEach((vote) => {
			updateAnswersMap(vote.uuid, vote.answerUuid);
		});
	}

	async function handleVote(answerUuid) {
		const response = await fetch("/api/vote", {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({ answers: answerUuid })
		});

		if(!response) {
			return ;
		}

		if (poll.multiple_choice) {
			if (votedAnswersUuids.includes(answerUuid)) {
				setVotedAnswersUuids(votedAnswersUuids.filter((uuid) => uuid !== answerUuid));
			} else {
				setVotedAnswersUuids([...votedAnswersUuids, answerUuid]);
			}
		} else {
			setVotedAnswersUuids([answerUuid]);
		}

		// To Do
	}

	useEffect(() => {
		getPoll();
		setTimeout(getPoll, 1000);
		setTimeout(getPoll, 3000);
		setTimeout(getPoll, 10000);

		ws.onmessage = (event) => {
			const receivedVotes = JSON.parse(event.data);
			console.log(receivedVotes);
			receivedVotes.forEach((vote) => {
				updateAnswersMap(vote.uuid, vote.answerUuid);
			})};
	  
		  // Close the WebSocket connection when the component unmounts
		  return () => {
			ws.close();
		  };
	}, []);


	// Check si on est le créateur de Poll ou pas
	return(
		<div className="poll-viewer">
			<div className="poll-viewer-left">
				<h1>{ poll?.question }</h1>
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