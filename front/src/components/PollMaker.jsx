import { useState } from "react";

export default function PollMaker({ goToPoll }) {
	const [question, setQuestion] = useState("");
	const [answers, setAnswers] = useState(["", ""]);
	const [multipleChoice, setMultipleChoice] = useState(false);
	const [multipleVote, setMultipleVote] = useState(false);
	const [changeVote, setChangeVote] = useState(false);

  function handleAnswerChange(index, value) {
    const updatedAnswers = [...answers];
    updatedAnswers[index] = value;
    setAnswers(updatedAnswers);
  };

  function handleAddAnswer() {
    const updatedAnswers = [...answers, ""];
    setAnswers(updatedAnswers);
  };

  function handleDeleteAnswer(index) {
    const updatedAnswers = [...answers];
    updatedAnswers.splice(index, 1);
    setAnswers(updatedAnswers);
  };

	async function submitPoll() {
		const response = await fetch("https://livepoll.nassing.fr/api/poll", {
		//const response = await fetch("http://localhost:6678/api/poll", {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({ question, answers, multipleChoice, multipleVote, changeVote })
		});

		const pollUuid = (await response.json()).pollUuid;

		if(pollUuid) {
			const uuidPattern = /^[0-9A-Z]{6}$/;
		
			if(uuidPattern.test(pollUuid)) {
				goToPoll(pollUuid);
			} else {
				// notification
			}
		}
	}

	return(
		<div className="poll-maker">
			<h1>Create a new poll</h1>
			
			<div className="poll-maker-question">
				<label>Question</label>
				<input type="text" id="poll-maker-question" value={ question } onChange={e => setQuestion(e.target.value)} />
			</div>

			<div className="poll-maker-answers">
				{ answers.map((answer, index) => (
					<div className="poll-maker-answer-line" key={`poll-maker-answer-line-${index}`}>
						<label>Answer {index + 1}</label>
						<input type="text" className="answer-text" value={ answer } onChange={(e) => handleAnswerChange(index, e.target.value)}/>
						{ index > 1 && <div className="answer-delete" onClick={() => handleDeleteAnswer(index)}>X</div>}
					</div>
				))}
					<button onClick={ () => handleAddAnswer }>Add new answer</button>
			</div>

			<div className="poll-maker-options">
				<div className="poll-maker-options-multiple-choice">
					<label>Multiple choice</label>
					<input type="checkbox" checked={multipleChoice} onChange={e => setMultipleChoice(e.target.checked)} />
					<label>Multiple vote</label>
					<input type="checkbox" checked={multipleVote} onChange={e => setMultipleVote(e.target.checked)} />
					<label>Change vote</label>
					<input type="checkbox" checked={changeVote} onChange={e => setChangeVote(e.target.checked)} />
				</div>
			</div>

			<div className="poll-maker-create">
				<button onClick={ () => submitPoll() }>Create</button>
			</div>
		</div>
	)
}