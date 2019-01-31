import * as Clipboard from "clipboard";
import * as Adaptive from "adaptivecards";
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import * as Constants from "./constants";
import * as Designer from "./card-designer-surface";
import * as DesignerPeers from "./designer-peers";
import { HostContainer } from "./containers/host-container";
import { adaptiveCardSchema } from "./adaptive-card-schema";
import { FullScreenHandler } from "./fullscreen-handler";
import { Toolbar, ToolbarButton, ToolbarChoicePicker, ToolbarElementAlignment } from "./toolbar";
import { IPoint, Utils } from "./miscellaneous";
import { BasePaletteItem, ElementPaletteItem } from "./tool-palette";
import { DefaultContainer } from "./containers/default/default-container";
import { SidePanel, SidePanelAlignment } from "./side-panel";
import { Toolbox } from "./tool-box";

export class CardDesigner {
    private static internalProcessMarkdown(text: string, result: Adaptive.IMarkdownProcessingResult) {
        if (CardDesigner.onProcessMarkdown) {
            CardDesigner.onProcessMarkdown(text, result);
        }
        else {
            // Check for markdownit
            if (window["markdownit"]) {
                result.outputHtml = window["markdownit"]().render(text);
                result.didProcess = true;
            }
		}
    }

    static onProcessMarkdown: (text: string, result: Adaptive.IMarkdownProcessingResult) => void = null;

    private static MAX_UNDO_STACK_SIZE = 50;

    private _monacoEditor: monaco.editor.IStandaloneCodeEditor;
    private _hostContainers: Array<HostContainer>;
    private _isMonacoEditorLoaded: boolean = false;
    private _designerSurface: Designer.CardDesignerSurface;
    private _propertySheetHostConfig: Adaptive.HostConfig;
    private _designerHostElement: HTMLElement;
    private _draggedPaletteItem: BasePaletteItem;
    private _draggedElement: HTMLElement;
    private _currentMousePosition: IPoint;
    private _card: Adaptive.AdaptiveCard;
    private _activeHostContainer: HostContainer;
    private _undoStack: Array<object> = [];
    private _undoStackIndex: number = -1;
    private _toolPaletteToolbox: Toolbox;
    private _propertySheetToolbox: Toolbox;
    private _treeViewToolbox: Toolbox;
    private _jsonEditorPanel: SidePanel;
    private _jsonEditorToolbox: Toolbox;
    private _dataToolbox: Toolbox;
	private _assetPath: string;

    private buildTreeView() {
        if (this._treeViewToolbox.content) {
            this._treeViewToolbox.content.innerHTML = "";
            this._treeViewToolbox.content.appendChild(this.designerSurface.rootPeer.treeItem.render());
        }
    }

    private buildPropertySheet(peer: DesignerPeers.DesignerPeer) {
        if (this._propertySheetToolbox.content) {
            this._propertySheetToolbox.content.innerHTML = "";

            let card: Adaptive.AdaptiveCard;

            if (peer) {
                card = peer.buildPropertySheetCard();
            }
            else {

                card = new Adaptive.AdaptiveCard();
                card.parse(
                    {
                        type: "AdaptiveCard",
                        version: "1.0",
                        body: [
                            {
                                type: "TextBlock",
                                wrap: true,
                                text: "**Nothing is selected**"
                            },
                            {
                                type: "TextBlock",
                                wrap: true,
                                text: "Select an element in the card to modify its properties."
                            }
                        ]
                    }
                );
                card.padding = new Adaptive.PaddingDefinition(
                    Adaptive.Spacing.Small,
                    Adaptive.Spacing.Small,
                    Adaptive.Spacing.Small,
                    Adaptive.Spacing.Small
                )
            }

            card.hostConfig = this._propertySheetHostConfig;

            this._propertySheetToolbox.content.appendChild(card.render());
        }
    }

    private addPaletteItem(paletteItem: BasePaletteItem, hostElement: HTMLElement) {
        paletteItem.render();
        paletteItem.onStartDrag = (sender: BasePaletteItem) => {
            this._draggedPaletteItem = sender;

            this._draggedElement = sender.cloneElement();
            this._draggedElement.style.position = "absolute";
            this._draggedElement.style.left = this._currentMousePosition.x + "px";
            this._draggedElement.style.top = this._currentMousePosition.y + "px";

            document.body.appendChild(this._draggedElement);
        }

        hostElement.appendChild(paletteItem.renderedElement);
    }

    private buildPalette() {
        this._toolPaletteToolbox.content.innerHTML = "";

        let categorizedTypes: Object = {};

        for (let i = 0; i < Adaptive.AdaptiveCard.elementTypeRegistry.getItemCount(); i++) {
            let dummyCardElement = Adaptive.AdaptiveCard.elementTypeRegistry.getItemAt(i).createInstance();
            let peerRegistration = Designer.CardDesignerSurface.cardElementPeerRegistry.findTypeRegistration((<any>dummyCardElement).constructor);

            if (peerRegistration) {
                if (!categorizedTypes.hasOwnProperty(peerRegistration.category)) {
                    categorizedTypes[peerRegistration.category] = [];
                }

                let paletteItem = new ElementPaletteItem(
                    Adaptive.AdaptiveCard.elementTypeRegistry.getItemAt(i),
                    peerRegistration
                )

                categorizedTypes[peerRegistration.category].push(paletteItem);
            }
        }

        for (let category in categorizedTypes) {
            let node = document.createElement('li');
            node.innerText = category;
            node.className = "acd-palette-category";

            this._toolPaletteToolbox.content.appendChild(node);

            for (var i = 0; i < categorizedTypes[category].length; i++) {
                this.addPaletteItem(categorizedTypes[category][i], this._toolPaletteToolbox.content);
            }
        }

        /* This is to test "snippet" support. Snippets are not yet fully baked
        let personaHeaderSnippet = new SnippetPaletteItem("Persona header");
        personaHeaderSnippet.snippet = {
            type: "ColumnSet",
            columns: [
                {
                    width: "auto",
                    items: [
                        {
                            type: "Image",
                            size: "Small",
                            style: "Person",
                            url: "https://pbs.twimg.com/profile_images/3647943215/d7f12830b3c17a5a9e4afcc370e3a37e_400x400.jpeg"
                        }
                    ]
                },
                {
                    width: "stretch",
                    items: [
                        {
                            type: "TextBlock",
                            text: "John Doe",
                            weight: "Bolder",
                            wrap: true
                        },
                        {
                            type: "TextBlock",
                            spacing: "None",
                            text: "Additional information",
                            wrap: true
                        }
                    ]
                }
            ]
        };

        this.addPaletteItem(personaHeaderSnippet);
        */
    }

    private endDrag() {
        if (this._draggedPaletteItem) {
            this._draggedPaletteItem.endDrag();
            this._draggedElement.remove();

            this._draggedPaletteItem = null;
            this._draggedElement = null;
        }
    }

    private recreateDesignerSurface() {
        let styleSheetLinkElement = <HTMLLinkElement>document.getElementById("adaptiveCardStylesheet");

        if (styleSheetLinkElement == null) {
            styleSheetLinkElement = document.createElement("link");
            styleSheetLinkElement.id = "adaptiveCardStylesheet";

            document.getElementsByTagName("head")[0].appendChild(styleSheetLinkElement);
        }

        styleSheetLinkElement.rel = "stylesheet";
		styleSheetLinkElement.type = "text/css";
		
		if(Utils.isAbsoluteUrl(this.activeHostContainer.styleSheet))
        {
			styleSheetLinkElement.href = this.activeHostContainer.styleSheet;
		}
		else
		{
			styleSheetLinkElement.href = Utils.joinPaths(this._assetPath, this.activeHostContainer.styleSheet);
		}

        let designerBackground = document.getElementById("designerBackground");

        if (designerBackground) {
            designerBackground.style.backgroundColor = this.activeHostContainer.getBackgroundColor();
        }

        this.activeHostContainer.initialize();

        this._designerHostElement.innerHTML = "";
        this.activeHostContainer.renderTo(this._designerHostElement);

        this._designerSurface = new Designer.CardDesignerSurface(this.activeHostContainer.cardHost);
        this._designerSurface.onSelectedPeerChanged = (peer: DesignerPeers.CardElementPeer) => {
            this.buildPropertySheet(peer);
        };
        this._designerSurface.onLayoutUpdated = (isFullRefresh: boolean) => {
            if (isFullRefresh) {
                this.scheduleUpdateJsonFromCard();
            }

            this.buildTreeView();
        };
        this._designerSurface.onCardValidated = (errors: Array<Adaptive.IValidationError>) => {
            let errorPane = document.getElementById("errorPane");
            errorPane.innerHTML = "";

            if (errors.length > 0) {
                let errorMessages: Array<string> = [];

                for (let error of errors) {
                    if (errorMessages.indexOf(error.message) < 0) {
                        errorMessages.push(error.message);
                    }
                }

                for (let message of errorMessages) {
                    let errorElement = document.createElement("div");
                    errorElement.style.overflow = "hidden";
                    errorElement.style.textOverflow = "ellipsis";
                    errorElement.innerText = message;

                    errorPane.appendChild(errorElement);
                }

                errorPane.classList.remove("acd-hidden");
            }
            else {
                errorPane.classList.add("acd-hidden");
            }
        };

        this.buildPalette();
        this.buildPropertySheet(null);

        if (this._card) {
            this._card.hostConfig = this.activeHostContainer.getHostConfig();
        }

        this._designerSurface.card = this._card;
    }

    private activeHostContainerChanged() {
        this.recreateDesignerSurface();
    }

    public updateJsonEditorLayout() {
        if (this._isMonacoEditorLoaded) {
            let jsonEditorPaneRect = this._jsonEditorPanel.contentHost.getBoundingClientRect();
            let jsonEditorHeaderRect = this._jsonEditorToolbox.getHeaderBoundingRect();
  
            this._jsonEditorToolbox.content.style.height = (jsonEditorPaneRect.height - jsonEditorHeaderRect.height) + "px";
  
            this._monacoEditor.layout();
        }
    }
    
    private updateFullLayout() {
        this.scheduleLayoutUpdate();
        this.updateJsonEditorLayout();
    }
    
    private jsonUpdateTimer: any;
    private cardUpdateTimer: any;
    private updateLayoutTimer: any;
    
    private preventCardUpdate: boolean = false;
    
    private setJsonPayload(payload: object) {
        this._monacoEditor.setValue(JSON.stringify(payload, null, 4));
    }

    private updateJsonFromCard(addToUndoStack: boolean = true) {
        try {
            this.preventCardUpdate = true;
    
            if (!this.preventJsonUpdate && this._isMonacoEditorLoaded) {
                let cardPayload = this.card.toJSON();
    
                if (addToUndoStack) {
                    this.addToUndoStack(cardPayload);
                }
    
                this.setJsonPayload(cardPayload);
            }
        }
        finally {
            this.preventCardUpdate = false;
        }
    }
    
    private scheduleUpdateJsonFromCard() {
        clearTimeout(this.jsonUpdateTimer);
    
        if (!this.preventJsonUpdate) {
            this.jsonUpdateTimer = setTimeout(() => { this.updateJsonFromCard(); }, 100);
        }
    }
    
    private preventJsonUpdate: boolean = false;
    
    private getCurrentJsonPayload(): string {
        return this._isMonacoEditorLoaded ? this._monacoEditor.getValue() : Constants.defaultPayload;
    }

    private updateCardFromJson() {
        try {
            this.preventJsonUpdate = true;
    
            if (!this.preventCardUpdate) {
                this.designerSurface.setCardPayloadAsString(this.getCurrentJsonPayload());
            }
        }
        finally {
            this.preventJsonUpdate = false;
        }
    }
    
    private scheduleUpdateCardFromJson() {
        clearTimeout(this.cardUpdateTimer);
    
        if (!this.preventCardUpdate) {
            this.cardUpdateTimer = setTimeout(() => { this.updateCardFromJson(); }, 100);
        }
    }
    
    private scheduleLayoutUpdate() {
        clearTimeout(this.updateLayoutTimer);
    
        this.updateLayoutTimer = setTimeout(() => { this.designerSurface.updateLayout(false); }, 50);
    }
    
    private _fullScreenHandler = new FullScreenHandler();
    private _fullScreenButton: ToolbarButton;
    private _hostContainerChoicePicker: ToolbarChoicePicker;
    private _undoButton: ToolbarButton;
    private _redoButton: ToolbarButton;
    private _newCardButton: ToolbarButton;
    private _copyJSONButton: ToolbarButton;

    private prepareToolbar() {
        this._fullScreenButton = new ToolbarButton(
            CardDesigner.ToolbarCommands.FullScreen,
            "Enter Full Screen",
            "acd-icon-fullScreen",
            (sender) => { this._fullScreenHandler.toggleFullScreen(); });
        this._fullScreenButton.displayCaption = false;
        this._fullScreenButton.toolTip = "Enter full screen";
        this._fullScreenButton.alignment = ToolbarElementAlignment.Right;

        this.toolbar.addElement(this._fullScreenButton);

        if (this._hostContainers && this._hostContainers.length > 0) {
            this._hostContainerChoicePicker = new ToolbarChoicePicker(CardDesigner.ToolbarCommands.HostAppPicker);
            this._hostContainerChoicePicker.separator = true;
            this._hostContainerChoicePicker.label = "Select host app:"
            this._hostContainerChoicePicker.width = 350;

            for (let i = 0; i < this._hostContainers.length; i++) {
                this._hostContainerChoicePicker.choices.push(
                    {
                        name: this._hostContainers[i].name,
                        value: i.toString(),
                    }
                );
            }

            this._hostContainerChoicePicker.onChanged = (sender) => {
                this.activeHostContainer = this._hostContainers[Number.parseInt(this._hostContainerChoicePicker.value)];

                this.activeHostContainerChanged();
            }

            this.toolbar.addElement(this._hostContainerChoicePicker);
        }

        this._undoButton = new ToolbarButton(
            CardDesigner.ToolbarCommands.Undo,
            "Undo",
            "acd-icon-undo",
            (sender) => { this.undo(); });
        this._undoButton.separator = true;
        this._undoButton.toolTip = "Undo your last change";
        this._undoButton.isEnabled = false;
        this._undoButton.displayCaption = false;

        this.toolbar.addElement(this._undoButton);

        this._redoButton = new ToolbarButton(
            CardDesigner.ToolbarCommands.Redo,
            "Redo",
            "acd-icon-redo",
            (sender) => { this.redo(); });
        this._redoButton.toolTip = "Redo your last changes";
        this._redoButton.isEnabled = false;
        this._redoButton.displayCaption = false;

        this.toolbar.addElement(this._redoButton);

        this._newCardButton = new ToolbarButton(
            CardDesigner.ToolbarCommands.NewCard,
            "New card",
            "acd-icon-newCard",
            (sender) => { this.newCard(); });
            this._newCardButton.separator = true;

        this.toolbar.addElement(this._newCardButton);

        this._copyJSONButton = new ToolbarButton(
            CardDesigner.ToolbarCommands.CopyJSON,
            "Copy JSON",
            "acd-icon-copy");
        this.toolbar.addElement(this._copyJSONButton);

        this._fullScreenHandler = new FullScreenHandler();
        this._fullScreenHandler.onFullScreenChanged = (isFullScreen: boolean) => {
            this._fullScreenButton.toolTip = isFullScreen ? "Exit full screen" : "Enter full screen";
    
            this.updateFullLayout();
        }
    }

    private onResize() {
        this._monacoEditor.layout();
    }

    private loadMonaco(callback: () => void) {
        // window["require"].config({ paths: { 'vs': './editor/monaco/min/vs' } });
        // window["require"](
        //     ['vs/editor/editor.main'],
        //     function () {
        //         callback();
		//     });
		
		// If loaded using WebPack this should work, but it's not right now...
		//callback();
    }	

    public monacoModuleLoaded(monaco: any = null) {
		if (!monaco) {
            monaco = window["monaco"];
        }

        let monacoConfiguration = {
            schemas: [
                {
                    uri: "http://adaptivecards.io/schemas/adaptive-card.json",
                    schema: adaptiveCardSchema,
                    fileMatch: ["*"],
                }
            ],
            validate: false,
            allowComments: true
        }
    
		// this._jsonEditorPane.content = document.createElement("div");
        this._jsonEditorToolbox.content = document.createElement("div");
        this._jsonEditorToolbox.content.style.overflow = "hidden";
		
		// TODO: set this in our editor instead of defaults
        monaco.languages.json.jsonDefaults.setDiagnosticsOptions(monacoConfiguration);

        this._monacoEditor = monaco.editor.create(
            // this._jsonEditorPane.content,
            this._jsonEditorToolbox.content,
            {
                folding: true,
                //validate: false,
                fontSize: 13.5,
                language: 'json',
                minimap: {
                    enabled: false
                }
            }
        );
        
        this._monacoEditor.onDidChangeModelContent(() => { this.scheduleUpdateCardFromJson(); });

        window.addEventListener('resize', () => { this.onResize(); });

        this._isMonacoEditorLoaded = true;

        this.updateJsonEditorLayout();
        this.updateJsonFromCard(false);
    }
    
    private updateToolbar() {
        this._undoButton.isEnabled = this.canUndo;
        this._redoButton.isEnabled = this.canRedo;
    }

    private addToUndoStack(payload: object) {
        let doAdd: boolean = true;

        if (this._undoStack.length > 0) {
            doAdd = this._undoStack[this._undoStack.length - 1] != payload;
        }

        if (doAdd) {
            let undoPayloadsToDiscard = this._undoStack.length - (this._undoStackIndex + 1);

            if (undoPayloadsToDiscard > 0) {
                this._undoStack.splice(this._undoStackIndex + 1, undoPayloadsToDiscard);
            }

            this._undoStack.push(payload);

            if (this._undoStack.length > CardDesigner.MAX_UNDO_STACK_SIZE) {
                this._undoStack.splice(0, 1);
            }

            this._undoStackIndex = this._undoStack.length - 1;

            this.updateToolbar();
        }
    }

    private handlePointerUp(e: PointerEvent) {
        this.endDrag();
        this.designerSurface.endDrag();
    }

    private handlePointerMove(e: PointerEvent) {
        this._currentMousePosition = { x: e.x, y: e.y };

        let isPointerOverDesigner = this.designerSurface.isPointerOver(this._currentMousePosition.x, this._currentMousePosition.y);
        let peerDropped = false;

        if (this._draggedPaletteItem && isPointerOverDesigner) {
            let peer = this._draggedPaletteItem.createPeer(this.designerSurface);

            let clientCoordinates = this.designerSurface.pageToClientCoordinates(this._currentMousePosition.x, this._currentMousePosition.y);

            if (this.designerSurface.tryDrop(clientCoordinates, peer)) {
                this.endDrag();

                this.designerSurface.startDrag(peer);

                peerDropped = true;
            }
        }

        if (!peerDropped && this._draggedElement) {
            this._draggedElement.style.left = this._currentMousePosition.x - 10 + "px";
            this._draggedElement.style.top = this._currentMousePosition.y - 10 + "px";
        }
    }

    readonly toolbar: Toolbar = new Toolbar();

    constructor(hostContainers: Array<HostContainer> = null) {
        Adaptive.AdaptiveCard.onProcessMarkdown = (text: string, result: Adaptive.IMarkdownProcessingResult) => {
            CardDesigner.internalProcessMarkdown(text, result);
        }

        this._hostContainers = hostContainers ? hostContainers : [];

        this.prepareToolbar();

        this._propertySheetHostConfig = new Adaptive.HostConfig(
            {
                preExpandSingleShowCardAction: true,
                supportsInteractivity: true,
                fontFamily: "Segoe UI",
                spacing: {
                    small: 10,
                    default: 20,
                    medium: 30,
                    large: 40,
                    extraLarge: 50,
                    padding: 20
                },
                separator: {
                    lineThickness: 1,
                    lineColor: "#EEEEEE"
                },
                textAlign: {
                    right: "right"
                },
                fontSizes: {
                    small: 12,
                    default: 14,
                    medium: 17,
                    large: 21,
                    extraLarge: 26
                },
                fontWeights: {
                    lighter: 200,
                    default: 400,
                    bolder: 600
                },
                imageSizes: {
                    small: 40,
                    medium: 80,
                    large: 160
                },
                containerStyles: {
                    default: {
                        backgroundColor: "#f9f9f9",
                        foregroundColors: {
                            default: {
                                default: "#333333",
                                subtle: "#EE333333"
                            },
                            accent: {
                                default: "#2E89FC",
                                subtle: "#882E89FC"
                            },
                            attention: {
                                default: "#cc3300",
                                subtle: "#DDcc3300"
                            },
                            good: {
                                default: "#54a254",
                                subtle: "#DD54a254"
                            },
                            warning: {
                                default: "#e69500",
                                subtle: "#DDe69500"
                            }
                        }
                    },
                    emphasis: {
                        backgroundColor: "#08000000",
                        foregroundColors: {
                            default: {
                                default: "#333333",
                                subtle: "#EE333333"
                            },
                            accent: {
                                default: "#2E89FC",
                                subtle: "#882E89FC"
                            },
                            attention: {
                                default: "#cc3300",
                                subtle: "#DDcc3300"
                            },
                            good: {
                                default: "#54a254",
                                subtle: "#DD54a254"
                            },
                            warning: {
                                default: "#e69500",
                                subtle: "#DDe69500"
                            }
                        }
                    }
                },
                actions: {
                    maxActions: 5,
                    spacing: Adaptive.Spacing.Default,
                    buttonSpacing: 10,
                    showCard: {
                        actionMode: Adaptive.ShowCardActionMode.Inline,
                        inlineTopMargin: 16
                    },
                    actionsOrientation: Adaptive.Orientation.Horizontal,
                    actionAlignment: Adaptive.ActionAlignment.Left
                },
                adaptiveCard: {
                    allowCustomStyle: true
                },
                imageSet: {
                    imageSize: Adaptive.Size.Medium,
                    maxImageHeight: 100
                },
                factSet: {
                    title: {
                        color: Adaptive.TextColor.Default,
                        size: Adaptive.TextSize.Default,
                        isSubtle: false,
                        weight: Adaptive.TextWeight.Bolder,
                        wrap: true,
                        maxWidth: 150,
                    },
                    value: {
                        color: Adaptive.TextColor.Default,
                        size: Adaptive.TextSize.Default,
                        isSubtle: false,
                        weight: Adaptive.TextWeight.Default,
                        wrap: true,
                    },
                    spacing: 10
                }
            }
        );

        this._propertySheetHostConfig.cssClassNamePrefix = "default";
    }

    attachTo(root: HTMLElement)  {
        let styleSheetLinkElement = document.createElement("link");
        styleSheetLinkElement.id = "__ac-designer";
        styleSheetLinkElement.rel = "stylesheet";
		styleSheetLinkElement.type = "text/css";		
        styleSheetLinkElement.href = Utils.joinPaths(this._assetPath, "adaptivecards-designer.css");

        document.getElementsByTagName("head")[0].appendChild(styleSheetLinkElement);

        if (this._hostContainers && this._hostContainers.length > 0) {
            this._activeHostContainer = this._hostContainers[0];
        }
        else {
            this._activeHostContainer = new DefaultContainer("Default", "default-container.css");
        }

        root.style.flex = "1 1 auto";
        root.style.display = "flex";
        root.style.flexDirection = "column";
        root.style.overflow = "hidden";

        root.innerHTML = 
            '<div id="toolbarHost"></div>' +
            '<div class="content" style="display: flex; flex: 1 1 auto; overflow-y: hidden;">' +
                '<div id="leftCollapsedPaneTabHost" class="acd-verticalCollapsedTabContainer acd-dockedLeft" style="border-right: 1px solid #D2D2D2;"></div>' +
                '<div id="toolPalettePanel" class="acd-toolPalette-pane"></div>' +
                '<div style="display: flex; flex-direction: column; flex: 1 1 100%; overflow: hidden;">' +
                    '<div style="display: flex; flex: 1 1 100%; overflow: hidden;">' +
                        '<div id="testLeftSidePanel"></div>' +
                        '<div id="designerBackground" style="flex: 1 1 70%; background-color: #F6F6F6; display: flex; flex-direction: column; overflow: auto;">' +
                            '<div style="flex: 1 1 100%; overflow: auto;">' +
                                '<div id="designerHost" style="margin: 20px 40px 20px 20px;"></div>' +
                            '</div>' +
                            '<div id="errorPane" class="acd-error-pane acd-hidden"></div>' +
                        '</div>' +
                        '<div id="treeViewPanel" class="acd-treeView-pane"></div>' +
                       '<div id="propertySheetPanel" class="acd-propertySheet-pane"></div>' +
                    '</div>' +
                    '<div id="jsonEditorPanel" class="acd-json-editor-pane"></div>' +
                    '<div id="bottomCollapsedPaneTabHost" class="acd-horizontalCollapsedTabContainer" style="border-top: 1px solid #D2D2D2;"></div>' +
                '</div>' +
                '<div id="rightCollapsedPaneTabHost" class="acd-verticalCollapsedTabContainer acd-dockedRight" style="border-left: 1px solid #D2D2D2;"></div>' +
            '</div>';

        this.toolbar.attachTo(document.getElementById("toolbarHost"));

        new Clipboard(
            this._copyJSONButton.renderedElement,
            {
                text: (trigger) => { return JSON.stringify(this.card.toJSON(), null, 4); }
            });
        
        // Tool palette panel
        let toolPaletteHost = document.createElement("div");
        toolPaletteHost.className = "acd-dockedPane";

        this._toolPaletteToolbox = new Toolbox("toolPalette", "Tool box");
        this._toolPaletteToolbox.content = toolPaletteHost;

        let toolPalettePanel = new SidePanel(
            "toolPalettePanel",
            SidePanelAlignment.Left,
            document.getElementById("leftCollapsedPaneTabHost"));
        toolPalettePanel.addToolbox(this._toolPaletteToolbox);
        toolPalettePanel.isResizable = false;

        toolPalettePanel.attachTo(document.getElementById("toolPalettePanel"));

        // JSON editor panel
        this._jsonEditorToolbox = new Toolbox("jsonEditor", "JSON Editor");
        this._jsonEditorToolbox.content = document.createElement("div");
        this._jsonEditorToolbox.content.style.padding = "8px";
        this._jsonEditorToolbox.content.innerText = "Loading editor...";

        this._jsonEditorPanel = new SidePanel(
            "jsonEditorPanel",
            SidePanelAlignment.Bottom,
            document.getElementById("bottomCollapsedPaneTabHost"));
        this._jsonEditorPanel.addToolbox(this._jsonEditorToolbox);
        this._jsonEditorPanel.onResized = (sender: SidePanel) => {
            this.updateJsonEditorLayout();
        }
        this._jsonEditorPanel.onToolboxResized = (sender: SidePanel) => {
            this.updateJsonEditorLayout();
        }
        this._jsonEditorPanel.onToolboxExpandedOrCollapsed = (sender: SidePanel) => {
            this.updateJsonEditorLayout();
        }

        this._jsonEditorPanel.attachTo(document.getElementById("jsonEditorPanel"));

        // Property sheet panel
        let propertySheetHost = document.createElement("div");
        propertySheetHost.className = "acd-propertySheet-host";

        this._propertySheetToolbox = new Toolbox("propertySheet", "Element properties");
        this._propertySheetToolbox.content = propertySheetHost;

        let propertySheetPanel = new SidePanel(
            "propertySheetPanel",
            SidePanelAlignment.Right,
            document.getElementById("rightCollapsedPaneTabHost"));
        propertySheetPanel.addToolbox(this._propertySheetToolbox);
        propertySheetPanel.onResized = (sender: SidePanel) => {
            this.scheduleLayoutUpdate();
        }

        propertySheetPanel.attachTo(document.getElementById("propertySheetPanel"));

        // Tree view panel
        let treeViewHost = document.createElement("div");
        treeViewHost.className = "acd-treeView-host";

        this._treeViewToolbox = new Toolbox("treeView", "Visual Tree View");
        this._treeViewToolbox.content = treeViewHost;

        let treeViewPanel = new SidePanel(
            "treeViewPanel",
            SidePanelAlignment.Right,
            document.getElementById("rightCollapsedPaneTabHost"));
        treeViewPanel.addToolbox(this._treeViewToolbox);
        treeViewPanel.onResized = (sender: SidePanel) => {
            this.scheduleLayoutUpdate();
        }

        this._dataToolbox = new Toolbox("data", "Data");
        treeViewPanel.addToolbox(this._dataToolbox);

        treeViewPanel.attachTo(document.getElementById("treeViewPanel"));

        this._designerHostElement = document.getElementById("designerHost")

        this.recreateDesignerSurface();

        this.loadMonaco(() => { this.monacoModuleLoaded(); });

        window.addEventListener("pointermove", (e: PointerEvent) => { this.handlePointerMove(e); });
        window.addEventListener("resize", () => { this.scheduleLayoutUpdate(); });
        window.addEventListener("pointerup", (e: PointerEvent) => { this.handlePointerUp(e); });

        let card = new Adaptive.AdaptiveCard();
        card.onImageLoaded = (image: Adaptive.Image) => {
            this.scheduleLayoutUpdate();
        }

        this.card = card;
    }

    undo() {
        if (this.canUndo) {
            this._undoStackIndex--;

            let card = this._undoStack[this._undoStackIndex];

            this.setJsonPayload(card);

            this.updateToolbar();
        }
    }

    redo() {
        if (this._undoStackIndex < this._undoStack.length - 1) {
            this._undoStackIndex++;

            let card = this._undoStack[this._undoStackIndex];

            this.setJsonPayload(card);

            this.updateToolbar();
        }
    }

    newCard() {
        let card = {
            type: "AdaptiveCard",
            version: "1.0",
            body: [
            ]
        }

        this.setJsonPayload(card);
    }

    setCard(payload: object) {
        try {
            this.preventJsonUpdate = true;
    
            if (!this.preventCardUpdate) {
                this.designerSurface.setCardPayloadAsObject(payload);
            }
        }
        finally {
            this.preventJsonUpdate = false;
        }

        this.updateJsonFromCard();
    }

    getCard(): object {
        return this.designerSurface.card.toJSON();
    }
    
    get activeHostContainer(): HostContainer {
        return this._activeHostContainer;
    }

    set activeHostContainer(value: HostContainer) {
        if (this._activeHostContainer !== value) {
            this._activeHostContainer = value;

            this.activeHostContainerChanged();
        }
    }

    get canUndo(): boolean {
        return this._undoStackIndex >= 1;
    }

    get canRedo(): boolean {
        return this._undoStackIndex < this._undoStack.length - 1;
    }

    get card(): Adaptive.AdaptiveCard {
        return this._card;
    }

    set card(value: Adaptive.AdaptiveCard) {
        if (this._card != value) {
            if (this._card) {
                this._card.designMode = false;
            }

            this._card = value;

            if (this._card) {
                this._card.designMode = true;
                this._card.hostConfig = this.activeHostContainer.getHostConfig();
            }

            this.recreateDesignerSurface();
            this.updateCardFromJson();
        }
    }

    get designerSurface(): Designer.CardDesignerSurface {
        return this._designerSurface;
    }

    get treeViewToolbox(): Toolbox {
        return this._treeViewToolbox;
    }

    get propertySheetToolbox(): Toolbox {
        return this._propertySheetToolbox;
    }

    get jsonEditorToolbox(): Toolbox {
        return this._jsonEditorToolbox;
    }

    get toolPaletteToolbox(): Toolbox {
        return this._toolPaletteToolbox;
	}
	
    get dataToolbox(): Toolbox {
        return this._dataToolbox;
	}
	
	get assetPath(): string {
		return this._assetPath;
	}
		
	set assetPath(value: string) {
		this._assetPath = value;
	}
}

export module CardDesigner {
    export class ToolbarCommands {
        static FullScreen = "__fullScreenButton";
        static HostAppPicker = "__hostAppPicker";
        static Undo = "__undoButton";
        static Redo = "__redoButton";
        static NewCard = "__newCardButton";
        static CopyJSON = "__copyJsonButton";
    }
}