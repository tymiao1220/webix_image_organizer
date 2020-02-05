const http = require("http");
const jwt = require("jsonwebtoken");
const jwtBlacklist = require("express-jwt-blacklist");

const successStatusCode = 200;

async function login(hostApi, authHeader) {
	const url = `${hostApi}/user/authentication`;

	const options = {
		headers: {
			Authorization: authHeader
		}
	};

	return new Promise((resolve, reject) => {
		http.get(url, options, (response) => {
			let body = "";
			const {statusCode} = response;
			if (statusCode !== successStatusCode) {
				const error = new Error("Request Failed.\n" +
					`Status Code: ${statusCode}`);
				return reject(error);
			}

			// A chunk of data has been recieved.
			response.on("data", (data) => {
				body += data;
			});
			// The whole response has been received. Print out the result.
			response.on("end", async () => {
				// parse user info
				body = JSON.parse(body);

				const user = body.user;
				const expireDate = new Date(body.authToken.expires);
				const expiresIn = expireDate.getTime() - Date.now();
				const token = jwt.sign({sub: user._id, lvl: user._accessLevel, prms: user.admin, exp: expiresIn}, process.env.SECRET_KEY);
				body.taggerJWT = token;

				resolve(body);
			});
		}).on("error", (err) => {
			reject(err);
		});
	});
}

async function logout(host, token, user) {
	const url = new URL(host);
	const path = `${url.pathname}/user/authentication`;

	const options = {
		hostname: url.hostname,
		path,
		port: url.port,
		method: "DELETE",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			"Girder-Token": token
		}
	};

	return new Promise((resolve, reject) => {
		const request = http.request(options, (response) => {
			let body = "";
			const {statusCode} = response;
			if (statusCode !== successStatusCode) {
				const error = new Error("Request Failed.\n" +
					`Status Code: ${statusCode}`);
				return reject(error);
			}

			// A chunk of data has been recieved.
			response.on("data", (data) => {
				body += data;
			});

			// The whole response has been received. Print out the result.
			response.on("end", () => {
				jwtBlacklist.revoke(user);
				resolve(body);
			});
		});

		request.on("error", (err) => {
			reject(err);
		});

		request.end();
	});
}

module.exports = {
	login,
	logout
};