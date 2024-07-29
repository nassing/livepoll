import { Outlet } from 'react-router-dom';

import NavBar from './NavBar';

export default function Layout({ goToPoll }) {
	return(
		<div>
			<NavBar goToPoll={ goToPoll } />
			<Outlet />
		</div>
)}