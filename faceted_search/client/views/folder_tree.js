
define([
	"app",
	"constants",
	"helpers/authentication",
	"helpers/ajax", 
	"models/upload"
], function (app, constants, auth, ajax, Upload) {
	const uploadButtonId = "upload-btn";
	const statusTempateId = "status-template";

	const treeView = {
		view: "tree",
		width: 320,
		id: constants.FOLDER_TREE_ID,
		select: true,
		scroll: "auto",
		type: "lineTree",
		oncontext: {},
		template: (obj, common) => {
			return `${common.icon(obj, common) + common.folder(obj, common)}<span style="height: 40px">${obj.name}</span>`;
		},
		scheme: {
			$init(obj) {
				if (obj._modelType === "folder" || obj._modelType === "collection") {
					obj.webix_kids = true;
				}
			}
		}
	};

	const statusTemplate = {
		template: obj => obj.title || "",
		borderless: true,
		id: statusTempateId,
		height: 50
	}

	const uploadButton = {
		view: "button",
		id: uploadButtonId,
		value: "Upload items from folder",
		disabled: true,
	}
	
	return {
		$ui: {rows: [treeView, statusTemplate, uploadButton]},
		$oninit: () => {
			const tree = $$(constants.FOLDER_TREE_ID);
			const uploadButton = $$(uploadButtonId);
			webix.extend(tree, webix.ProgressBar);
			tree.showProgress();
			ajax.getCollection()
				.then((data) => {
					tree.parse(data);
				})
				.finally(() => {
					tree.hideProgress();
				});
			
			tree.attachEvent("onDataRequest", (id) => {
				const item = tree.getItem(id);
				tree.showProgress();
				ajax.getFolder(item._modelType, item._id)
					.then((data) => {
						tree.parse({parent: id, data})
					})
					.finally(() => {
						tree.hideProgress();
					});
			});

			tree.attachEvent("onAfterSelect", (id) => {
				const item = tree.getItem(id);
				if (item._modelType === "folder") {
					uploadButton.enable();
				}
				else {
					uploadButton.disable();
				}
			});

			uploadButton.attachEvent("onItemClick", () => {
				const folder = tree.getSelectedItem();
				tree.showProgress();
				uploadButton.disable();
				ajax.getResourceItems(folder._id, folder._modelType)
					.then((data) => {
						const file = new File([data], `${folder.name}.json`, {type: data.type});
						Upload.uploadJSONFile({
							file,
							name: file.name,
							size: file.size
						});
						app.callEvent("editForm:loadDataForFilters", []);
					})
					.finally(() => {
						tree.hideProgress();
						uploadButton.enable();
					});
			});

			app.attachEvent("uploaderList:loadingActions", function(data) {
				$$(statusTempateId).setValues(data);
			});
		
			app.attachEvent("uploaderList:clearAfterSave", function() {
				$$(statusTempateId).setValues({title: "Done!"});
			});
		}
    };
});

