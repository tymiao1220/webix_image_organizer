const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const foldersSchema = new Schema({
	name: {
		type: String, required: true
	},
	parentId: {
		type: String, required: true
	},
	parentCollection: {
		type: String, required: true
	}
});

foldersSchema.set("toJSON", {virtuals: false});
const Folders = mongoose.model("Folders", foldersSchema);

module.exports = Folders;
