import transitionalAjax from "../transitionalAjaxService";
import auth from "../authentication";
import DataviewService from "./dataviewService";
import CustomDataPull from "../../models/customDataPullClass";
import "../globalEvents";
import imageWindow from "../../views/windows/imageWindow";
import UpdatedImagesService from "./updateImageService";
import constants from "../../constants";
import InfoPopup from "../../views/windows/infoPopup";
import hotkeysFactory from "./hotkeys";

export default class UserViewService {
	constructor(view) {
		this._view = view;
		this.dataviewOverlayText = "No items loaded. Please, log in";
		this._ready();
	}

	_ready() {
		webix.extend(this._view, webix.ProgressBar);
		const scope = this._view.$scope;
		// child views
		this._dataview = scope.getUserDataview();
		this._dataviewStore = new CustomDataPull(this._dataview);
		this._pager = scope.getDataviewPager();
		this._taskList = scope.getTaskList();
		this._taskAccordionItem = scope.getTaskAccordionItem();
		this._accordion = scope.getAccordion();
		this._imageSizeSelect = scope.getSelectImageSize();
		this._taskListStore = new CustomDataPull(this._taskList);
		this._tagSelect = scope.getTagSelect();
		this._valueSelect = scope.getValueSelect();
		this._itemsCountTemplate = scope.getItemsCountTemplate();
		this._nextButton = scope.getNextButton();
		this._imageWindow = scope.ui(imageWindow);
		this._tagInfoTemplate = scope.getTagInfoTemplate();
		this._hotkeyInfoTemplate = scope.getHotkeysInfoTemplate();
		this._dataviewService = new DataviewService(this._dataview,	this._dataviewStore, this._pager, this._imageSizeSelect);
		this._tagInfoPopup = scope.ui(new InfoPopup(scope.app, "tag", "Tag help"));
		this._hotkeysInfoPopup = scope.ui(new InfoPopup(scope.app, "hotkeys", "Hot-keys"));

		webix.extend(this._taskList, webix.OverlayBox);

		this._updatedImagesService = new UpdatedImagesService(
			this._dataview,
			this._dataviewStore,
			this._tagSelect,
			this._valueSelect
		);

		this._hotkeysService = hotkeysFactory.createService(
			this._dataview,
			this._dataviewStore,
			this._tagSelect,
			this._valueSelect,
			this._updatedImagesService
		);

		if (auth.isLoggedIn() && !auth.isAdmin()) {
			this._loggedInUserService();
		}

		this._attachViewEvents();
	}

	_attachViewEvents() {
		this._attachDataviewEvents();
		this._accordion.attachEvent("onAfterCollapse", () => {
			this._setPopupsPosition();
			this._resizeDataview();
		});
		this._accordion.attachEvent("onAfterExpand", () => {
			this._setPopupsPosition();
			this._resizeDataview();
		});
		this._view.$scope.on(this._view.$scope.app, "windowResize", () => {
			this._setPopupsPosition();
			this._resizeDataview();
		});

		this._imageSizeSelect.attachEvent("onChange", (val) => {
			this._dataviewService.changeImageSize(val);
			this._resizeDataview();
		});

		const sizeValue = this._imageSizeSelect.getValue();
		this._dataviewService.changeImageSize(sizeValue);
		this._resizeDataview();
	}

	_loggedInUserService() {
		this._getTasks();
		const tagList = this._tagSelect.getList();
		const valuesList = this._valueSelect.getList();

		this._taskList.attachEvent("onSelectChange", () => {
			this._toggleVisibilityOfHiddenViews();
			const task = this._taskList.getSelectedItem();
			this._pager.blockEvent();
			this._pager.select(0);
			this._pager.unblockEvent();
			this._dataviewStore.clearAll();
			if (task) {
				this._selectTask(task);
			}
			else {
				this._toggleVisibilityOfDropdowns();
			}
			this._view.$scope.app.callEvent("OnTaskSelect", [task]);
		});

		this._tagSelect.attachEvent("onChange", (id) => {
			valuesList.clearAll();
			this._valueSelect.setValue();
			this._tagInfoTemplate.setValues({});
			if (id) {
				const tag = tagList.getItem(id);
				valuesList.parse(tag.values);

				this._tagInfoTemplate.setValues(tag);

				if (this._tagInfoPopup.isVisible()) {
					const obj = this._tagInfoTemplate.getValues() || {};
					this._tagInfoPopup.setNewData(obj);
				}

				let preselectedId = valuesList.getFirstId();
				if (tag.type === constants.TAG_TYPES.MULTI_WITH_DEFAULT) {
					preselectedId = valuesList.find(value => value.name === tag.default, true).id;
					valuesList.updateItem(preselectedId, {default: true});
				}
				this._valueSelect.setValue(preselectedId);
			}
		});

		this._valueSelect.attachEvent("onChange", (id) => {
			if (id) {
				this._dataview.refresh();
			}
		});

		this._pager.attachEvent("onAfterPageChange", () => {
			const indexes = this._getNotLoadedItemIndex();
			if (indexes.pageIndex > -1) {
				this._getImages(indexes.index, indexes.limit);
			}
		});

		this._nextButton.attachEvent("onItemClick", () => {
			const pageItems = this._getItemsOnThePage();
			const dataToUpdate = [];
			const changedItems = this._updatedImagesService.changedItems;
			const tasks = this._taskList.getSelectedItem(true);
			const taskIds = tasks.map(task => task._id);

			this._view.showProgress();
			pageItems.each((item) => {
				if (item.meta && item.meta.hasOwnProperty("tags")) {
					dataToUpdate.push({
						_id: item._id,
						tags: item.meta.tags
					});
				}
			});
			transitionalAjax.reviewImages(dataToUpdate, taskIds)
				.then((response) => {
					const images = response.data;
					images.forEach((image) => {
						delete changedItems[image._id];
					});
					webix.message(response.message);
					this._view.hideProgress();

					this._dataviewStore.clearAll();
					this._getImages();
				})
				.catch(() => {
					this._view.hideProgress();
				});
		});

		this._hotkeyInfoTemplate.define("onClick", {
			"info-template-icon": () => {
				this._showInfoPopup(this._hotkeyInfoTemplate, this._hotkeysInfoPopup);
			}
		});

		this._tagInfoTemplate.define("onClick", {
			"info-template-icon": () => {
				this._showInfoPopup(this._tagInfoTemplate, this._tagInfoPopup);
			}
		});
	}

	_showInfoPopup(template, popupClass) {
		const obj = template.getValues() || {};
		const popup = popupClass.getInfoPopup();
		const templateNode = template.getNode();
		if (popup.isVisible()) {
			popupClass.closeWindow();
		}
		else if (obj.help) {
			popupClass.showWindow(templateNode, {pos: "bottom"}, obj);
		}
	}

	_getNotLoadedItemIndex() {
		const pData = this._pager.data;
		const offset = pData.size * pData.page;
		const last = offset + pData.size;
		const items = this._dataview.data.serialize();
		const pageItems = items.slice(offset, last);
		const pageIndex = pageItems.findIndex(item => !item);
		const index = pageIndex + offset;
		const limit = pData.size - pageIndex;

		return {index, pageIndex, limit};
	}

	_getTasks() {
		this._view.showProgress();
		transitionalAjax.getTasks()
			.then((data) => {
				this._taskListStore.parseItems(data);
				if (!data.length) {
					this._taskAccordionItem.collapse();
					this._taskAccordionItem.disable();
				}
				else {
					const firstId = this._taskList.getFirstId();
					this._taskAccordionItem.enable();
					this._taskList.select(firstId);
				}

				this._setDataviewOverLay();
				this._view.hideProgress();
			})
			.fail(() => {
				this._taskAccordionItem.collapse();
				this._taskAccordionItem.disable();
				this._view.hideProgress();
			});
	}

	_parseHoteysInfoTemplateData() {
		const keysObj = this._updatedImagesService.hotkeys;
		const hotkeys = Object.keys(keysObj);
		let help = "<ul class='tagger-hotkeys-list'>";
		hotkeys.forEach((key) => {
			// 0 is the name of the tag, 1 is the name of the value
			help += `<li><b style='font-weight: bold'>"${key}"</b> - ${keysObj[key][0]}: ${keysObj[key][1]}</li>`;
		});
		help += "</ul>";
		const infoObject = {
			description: `<span><b style='font-weight: bold'>Hot-keys (${hotkeys.length})</b> Please, mouse over an image and press:</span>`,
			help,
			showHelp: false
		};
		this._hotkeyInfoTemplate.setValues(infoObject);
	}

	_selectTask(task) {
		this._updatedImagesService.predefinedTags = {};
		this._updatedImagesService.hotkeys = {};
		const tagList = this._tagSelect.getList();
		tagList.clearAll();

		this._tagSelect.setValue();
		this._view.showProgress();
		transitionalAjax.getTagsWithValuesByTask(task._id)
			.then((data) => {
				tagList.parse(data);
				const firstId = tagList.getFirstId();
				if (firstId) {
					this._tagSelect.setValue(firstId);
				}

				this._updatedImagesService.collectDefaultValuesAndHotkeys();
				this._parseHoteysInfoTemplateData();
				this._hotkeysService.selectNewScope(task.name, this._updatedImagesService.hotkeys);

				if (this._tagInfoPopup.isVisible()) {
					const obj = this._tagInfoTemplate.getValues() || {};
					this._tagInfoPopup.setNewData(obj);
				}
				if (this._hotkeysInfoPopup.isVisible()) {
					const obj = this._hotkeyInfoTemplate.getValues() || {};
					this._hotkeysInfoPopup.setNewData(obj);
				}

				this._toggleVisibilityOfDropdowns(true);
				this._view.hideProgress();
				return this._checkTask(task);
			})
			.fail(() => {
				this._view.hideProgress();
			});
	}

	_checkTask(task) {
		if (!task.checked_out) {
			this._view.showProgress();
			return transitionalAjax.checkTask(task._id)
				.then((response) => {
					webix.message(response.message);
					const updatedTask = response.data;
					this._taskListStore.updateItem(null, updatedTask._id, updatedTask);
					return this._getImages();
				});
		}
		return this._getImages();
	}

	_getImages(startWith, limit) {
		this._view.showProgress();
		let promise = Promise.resolve(false);
		const params = this._getParamsForImages(startWith, limit);
		if (params.ids.length) {
			promise = transitionalAjax.getImagesByTask(params);
		}
		return promise
			.then((images) => {
				if (images) {
					// define tags with default values to images
					const processedImages = this._updatedImagesService.presetDefaultValues(images.data);

					this._dataviewStore.parseItems(processedImages, params.offset, images.count);

					this._itemsCountTemplate.setValues({
						count: images.count,
						totalCount: images.totalCount
					});

					if (!images.count) {
						this._toggleVisibilityOfHiddenViews();
					}
					else {
						this._toggleVisibilityOfHiddenViews(true);
					}

					this._view.hideProgress();
					return processedImages;
				}
				return false;
			})
			.catch(() => {
				this._view.hideProgress();
			});
	}

	_getParamsForImages(startWith, limit) {
		const tasks = this._taskList.getSelectedItem(true);
		const folderIds = tasks.map(task => task.folderId);
		const offset = startWith || this._pager.data.size * this._pager.data.page;
		limit = limit || this._pager.data.size;
		const params = {
			ids: folderIds,
			offset,
			limit
		};
		return params;
	}

	_attachDataviewEvents() {
		this._setDataviewOverLay();
		this._dataviewService.onResizeDataview();

		this._dataview.data.attachEvent("onStoreUpdated", () => {
			this._setDataviewOverLay();
		});

		this._dataview.attachEvent("onItemDblClick", (id) => {
			const item = this._dataviewStore.getItemById(id);
			this._imageWindow.showWindow(item);
		});

		this._dataview.attachEvent("onItemClick", (id, e) => {
			if (e.target.classList.contains("unchecked")) {
				this._updatedImagesService.addSelectedTagValueToImage(id);
				return false;
			}
			else if (e.target.classList.contains("checked") && e.target.classList.contains("enabled")) {
				this._updatedImagesService.removeSelectedTagValueFromImage(id);
				return false;
			}
		});
	}

	_setDataviewOverLay() {
		const count = this._dataview.count();
		let overlayText = "";

		if (!auth.isLoggedIn()) {
			overlayText = "No items loaded. Please, log in";
		}
		else if (!this._taskList.count()) {
			overlayText = "No tasks to review";
		}
		else {
			overlayText = "No items to review";
		}
		this._dataviewService.setDataviewState(count, overlayText);
	}

	_resizeDataview() {
		const xSpacer = this._view.queryView({selector: "dataview_x_spacer"});
		const ySpacer = this._view.queryView({selector: "dataview_y_spacer"});
		if (xSpacer.isVisible()) xSpacer.hide();
		if (ySpacer.isVisible()) ySpacer.hide();
		this._dataviewService.onResizeDataview()
			.then((page) => {
				this._pager.select(page);
				// to align dataview to center
				const {xReminder, yReminder} = this._dataviewService.getVisibleRange();

				const xSpacerWidth = xReminder / 2;
				xSpacer.define("width", xSpacerWidth);
				if (xSpacerWidth >= 16 && this._dataview.count()) xSpacer.show();

				const ySpacerHeight = yReminder / 2;
				ySpacer.define("height", ySpacerHeight);
				if (xSpacerWidth >= 16 && this._dataview.count()) ySpacer.show();
			});
	}

	_getItemsOnThePage() {
		// without arguments returns items on current page
		return this._dataview.data.getRange();
	}

	_toggleVisibilityOfHiddenViews(show) {
		const hiddenViews = this._view.$scope.getInitiallyHiddenViews();
		hiddenViews.forEach((view) => {
			if (show) view.show();
			else view.hide();
		});
		this._resizeDataview();
	}

	_toggleVisibilityOfDropdowns(show) {
		const dropdownsLayout = this._view.queryView({selector: "task_dropdowns"});
		if (show) dropdownsLayout.show();
		else dropdownsLayout.hide();
		this._resizeDataview();
	}

	_setPopupsPosition() {
		this._hotkeysInfoPopup.setInitPosition();
		this._tagInfoPopup.setInitPosition();
	}
}