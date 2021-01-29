
// ******* Repeater MANAGER ******** //
$axure.internal(function($ax) {
    var _repeaterManager = {};
    $ax.repeater = _repeaterManager;

    var _refreshType = _repeaterManager.refreshType = {
        reset: 1,
        persist: 2,
        preEval: 3
    };

    //This is a mapping of current editItems
    var repeaterToEditItems = {};
    //This is a mapping of current filters
    var repeaterToFilters = {};
    // This is a mapping of current sorts
    var repeaterToSorts = {};
    // This is a mapping of repeater page info
    var repeaterToPageInfo = {};

    //Hopefully this can be simplified, but for now I think 3 are needed.
    //This is the data set that is owned by this repeater. The repeater may or may not reference this data set, and others can reference it.
    var repeaterToLocalDataSet = {};
    //This is the data set referenced by the repeater. It is not a copy of the local data set, but a reference to a local data set (or eventually a global data set could be referenced).
    var repeaterToCurrentDataSet = {};
    //This is a copy of the current data set, that is replaced whenever a set or refresh is done.
    var repeaterToActiveDataSet = {};
    var _loadRepeaters = function() {
        $ax(function(obj) { 
            return $ax.public.fn.IsRepeater(obj.type);
        }).each(function(obj, repeaterId) {
            repeaterToLocalDataSet[repeaterId] = $ax.deepCopy(obj.data);
            repeaterToLocalDataSet[repeaterId].props = obj.dataProps;
            repeaterToEditItems[repeaterId] = [];

            _initPageInfo(obj, repeaterId);

            _setRepeaterDataSet(repeaterId, repeaterId);
            var initialItemIds = obj.repeaterPropMap.itemIds;
            for (var i = 0; i < initialItemIds.length; i++) $ax.addItemIdToRepeater(initialItemIds[i], repeaterId);
            $ax.visibility.initRepeater(repeaterId);
        });
    };
    _repeaterManager.loadRepeaters = _loadRepeaters;

    var fullRefresh = {};
    var repeatersReady = false;
    var _initRepeaters = function () {
        repeatersReady = true;
        $ax(function(obj, repeaterId) {
            return $ax.public.fn.IsRepeater(obj.type);
        }).each(function(obj, repeaterId) {
            _refreshRepeater(repeaterId, undefined, _refreshType.reset, !fullRefresh[repeaterId]);
            //// Fix selected and default if necessary
            //var states = obj.evaluatedStates[repeaterId];
            //if(!states) return; // If there are no evaluated states the repeater id key could not be mapped to an array of states.

            //for(var i = 0; i < states.length; i++) {
            //    var state = states[i];

            //    $ax.style.SetWidgetEnabled(state.id, true); // So selected will take place. If disabled, selected wouldn't happen.
            //    $ax.style.SetWidgetSelected(state.id, state.selected);
            //    $ax.style.SetWidgetEnabled(state.id, !state.disabled);
            //}
        });
    };
    _repeaterManager.initRefresh = _initRepeaters;

    var repeatersHaveNewDataSet = [];
    var _setRepeaterDataSet = function(repeaterId, dataSetId) {
        //TODO: No idea about how global data sets will be handled...
        repeaterToCurrentDataSet[repeaterId] = repeaterToLocalDataSet[dataSetId];
        repeaterToActiveDataSet[repeaterId] = getActiveDataSet(repeaterId);
        repeaterToFilters[repeaterId] = [];
        repeaterToSorts[repeaterId] = [];


        // Not using this currently
        //        if(repeatersHaveNewDataSet.indexOf(repeaterId) == -1) repeatersHaveNewDataSet[repeatersHaveNewDataSet.length] = repeaterId;
    };
    _repeaterManager.setDataSet = _setRepeaterDataSet;

    var _refreshRepeater = function(repeaterId, eventInfo, refreshType, itemsPregen) {
        if(!refreshType) refreshType = _refreshType.reset; // Set default
        if(!repeatersReady) {
            fullRefresh[repeaterId] = true;
            return;
        }

        // Reset selected/disabled dictionaries upon reset, if necessary (reset must, persist can't, and preeval doesn't care because it hasn't been set up yet.
        if(refreshType == _refreshType.reset) $ax.style.clearStateForRepeater(repeaterId);

        // Don't show if you have a parent rdos thats limboed.
        var rdoPath = $ax.getPathFromScriptId(repeaterId);
        // Check each parent rdo through appropriate views to see if you are limboed
        while (rdoPath.length > 0) {
            if(!$ax.getScriptIdFromPath(rdoPath)) {
                removeItems(repeaterId);
                return;
            }

            $ax.splice(rdoPath, rdoPath.length - 1, 1);
        }
        
        $ax.action.refreshStart(repeaterId);
        $ax.style.ClearCacheForRepeater(repeaterId);

        if($ax.visibility.limboIds[repeaterId]) {
            removeItems(repeaterId);
            $ax.dynamicPanelManager.fitParentPanel(repeaterId);
            return;
        }

        // Remove delete map if there is one at this point
        if(eventInfo && eventInfo.repeaterDeleteMap) delete eventInfo.repeaterDeleteMap[repeaterId];
        var path = $ax.getPathFromScriptId(repeaterId);
        path.pop();

        if(eventInfo) {
            eventInfo = $ax.eventCopy(eventInfo);
        }

        var obj = $ax.getObjectFromScriptId(repeaterId);
        var propMap = obj.repeaterPropMap;

        //If there is no wrap, then set it to be above the number of rows
        var viewId = $ax.adaptive.currentViewId || '';
        var wrap = _getAdaptiveProp(propMap, 'wrap', viewId, repeaterId, obj);
        var vertical = _getAdaptiveProp(propMap, 'vertical', viewId, repeaterId, obj);
        //var offset = propMap[viewId];
        var offset = propMap[_getViewIdFromPageViewId(viewId, repeaterId, obj)];

        // Right now pregen only works for default adaptive view
        if(viewId) itemsPregen = false;
        var orderedIds = [];
        if(itemsPregen) {
            var repeaterChildren = $jobj(repeaterId).children();
            // Start at 1 to skip script div child
            for(var i = 1; i < repeaterChildren.length; i++) {
                orderedIds.push(_getItemIdFromElementId($(repeaterChildren[i]).attr('id')));
            }
        } else orderedIds = getOrderedIds(repeaterId, eventInfo);
        var ids = [];
        var background = _getAdaptiveProp(propMap, 'backColor', viewId, repeaterId, obj);
        var hasAltColor = _getAdaptiveProp(propMap, 'hasAltColor', viewId, repeaterId, obj);
        var altColor = hasAltColor ? _getAdaptiveProp(propMap, 'altColor', viewId, repeaterId, obj) : undefined;
        var useAlt = false;

        if(itemsPregen) {
            var start = 0;
            var end = orderedIds.length;
        } else {
            var bounds = _getVisibleDataBounds(repeaterToPageInfo[repeaterId], itemsPregen ? obj.data.length : orderedIds.length);
            start = bounds[0];
            end = bounds[1];
        }

        var repeaterObj = $jobj(repeaterId);
        var preevalMap = {};

        var shownCount = end - start;
        var primaryCount = wrap == -1 ? shownCount : Math.min(shownCount, wrap);
        var secondaryCount = wrap == -1 ? 1 : Math.ceil(shownCount / wrap);
        var widthCount = vertical ? secondaryCount : primaryCount;
        var heightCount = vertical ? primaryCount : secondaryCount;
        var paddingTop = _getAdaptiveProp(propMap, 'paddingTop', viewId, repeaterId, obj);
        var paddingLeft = _getAdaptiveProp(propMap, 'paddingLeft', viewId, repeaterId, obj);
        var paddingY = paddingTop + _getAdaptiveProp(propMap, 'paddingBottom', viewId, repeaterId, obj);
        var paddingX = paddingLeft + _getAdaptiveProp(propMap, 'paddingRight', viewId, repeaterId, obj);

        var spacingX = _getAdaptiveProp(propMap, 'horizontalSpacing', viewId, repeaterId, obj);
        var xOffset = offset.width + spacingX;
        var spacingY = _getAdaptiveProp(propMap, 'verticalSpacing', viewId, repeaterId, obj);
        var yOffset = offset.height + spacingY;
        var repeaterSize = { width: paddingX, height: paddingY };
        repeaterSize.width += offset.width + (widthCount - 1) * xOffset;
        repeaterSize.height += offset.height + (heightCount - 1) * yOffset;
        $ax.visibility.setResizedSize(repeaterId, repeaterSize.width, repeaterSize.height);

        if(itemsPregen) {
            var templateIds = [repeaterId];
            var processScriptIds = function (full, prop, id) {
                if(id.indexOf('_') <= 0 && id.indexof('p')="=" -1) templateids.push('u' + id); }; $('#' repeaterid '_script').html().replace( (id|for)="?u([0-9]+(p([0-9]){3})?(_[_a-z0-9]*)?)" ? g, processscriptids); for(var i="0;" < templateids.length; i++) { j="0;" orderedids.length; j++) ids.push(_createelementid(templateids[i], orderedids[j])); } pos="start;" end; pos++) var itemid="orderedIds[pos];" itemelementid="_createElementId(repeaterId," itemid); jobj="$jobj(itemElementId);" if(jobj.hasclass('preeval')) refreshtype="_refreshType.preEval;" $ax.initializeobjectevents($ax('#' _createelementid(templateids[i], itemid)), refreshtype); if(refreshtype="=" _refreshtype.preeval) preevalmap[itemid]="true;" jobj.removeclass('preeval'); $ax.visibility.setresizedsize(itemelementid, $ax.getnumfrompx(jobj.css('width')), $ax.getnumfrompx(jobj.css('height'))); $ax.visibility.setmovedlocation(itemelementid, $ax.getnumfrompx(jobj.css('left')), $ax.getnumfrompx(jobj.css('top'))); else html="$('#'" '_script').html(); div="$('<div">');
            div.html(html);
            div.find('.' + $ax.visibility.HIDDEN_CLASS).removeClass($ax.visibility.HIDDEN_CLASS);
            div.find('.' + $ax.visibility.UNPLACED_CLASS).removeClass($ax.visibility.UNPLACED_CLASS);
            div.css({
                width: offset.width,
                height: offset.height
            });

            _applyColorCss(background, div);
            var altDiv = div;
            if(hasAltColor) altDiv = _applyColorCss(altColor, div.clone());

            // Hide repeater, if shown, while updating.
            var shown = $ax.visibility.IsIdVisible(repeaterId);
            if(shown) document.getElementById(repeaterId).style.visibility = 'hidden';

            //clean up old items as late as possible
            removeItems(repeaterId);
            resetItemSizes(repeaterId, offset, bounds, orderedIds, vertical, wrap);

            var i = 0;
            var startTop = paddingTop;
            var startLeft = paddingLeft;
            if(repeaterObj.css('box-sizing') == 'border-box') {
                startTop -= $ax.getNumFromPx(repeaterObj.css('border-top-width')) || 0;
                startLeft -= $ax.getNumFromPx(repeaterObj.css('border-left-width')) || 0;
            }
            var top = startTop;
            var left = startLeft;
            for(pos = start; pos < end; pos++) {
                itemId = orderedIds[pos];

                var itemElementId = _createElementId(repeaterId, itemId);
                $ax.addItemIdToRepeater(itemId, repeaterId);

                ids.push(itemElementId);
                var processId = function(full, prop, id) {
                    var elementId = _createElementId('u' + id, itemId);
                    //If there is a suffix (ex. _img), then don't push the id.
                    if (id.indexOf('_') <= 0 32 && id.indexof('p')="=" -1) ids.push(elementid); return prop + '="' + elementId + '" '; }; var copy="(useAlt" ? altdiv : div).clone(); usealt="!useAlt;" copy.attr('id', itemelementid); copy.html(div.html().replace( (id|for)="?u([0-9]+(p([0-9]){3})?(_[_a-z0-9]*)?)" g, processid)); if(obj.repeaterpropmap.isolateradio) { radiobuttons="copy.find(':radio');" for(var radioindex="0;" < radiobuttons.length; radioindex++) radio="$(radioButtons[radioIndex]);" oldname="radio.attr('name')" || ''; can't use create element id because there could be an underscore in name if(oldname) radio.attr('name', '-' itemid); } copy.css({ 'position': 'absolute', 'top': top 'px', 'left': left 'width': obj.width 'height': obj.height 'px' }); $('#' repeaterid).append(copy); $ax.visibility.setresizedsize(itemelementid, offset.width, offset.height); $ax.visibility.setmovedlocation(itemelementid, left, top); i++; if(wrap !="-1" i % wrap="=" 0) if(vertical) else if (vertical) repeaterobj.css(repeatersize); had to move this here it sets up cursor: pointer on inline links, but must done before style cached when adaptive view is set. todo: should able combine with initialization pregen items. just need have ids and template the same. for (var ids.length; i++) childjobj="$jobj(id);" (obj.repeaterpropmap.isolateselection childjobj.attr('selectiongroup')) childjobj.attr('selectiongroup', _createelementid(childjobj.attr('selectiongroup'), _getitemidfromelementid(id))); $ax.initializeobjectevents($ax('#' id), refreshtype); query="_getItemQuery(repeaterId);" if(viewid) $ax.adaptive.applyview(viewid, query); $ax.visibility.resetlimboandhiddentodefaults(_getitemquery(repeaterid, preevalmap)); $ax.annotation.createfootnotes(query, true); index="0;" index++) ($ax.iecolormanager) $ax.iecolormanager.applybackground($ax('#' id)); $ax.style.initializeobjecttextalignment($ax('#' $ax.applyhighlight($ax('#' $ax.messagecenter.startcombineeventmessages(); $ax.cacherepeaterinfo(repeaterid, $ax.getwidgetinfo(repeaterid)); $ax.style.startsuspendtextalignment(); now load for(pos="start;" pos end; pos++) itemid="orderedIds[pos];" itemelementid="_createElementId(repeaterId," if(!preevalmap[orderedids[pos]]) $ax.event.raisesyntheticevent(itemelementid, 'onitemload', $ax.loaddynamicpanelsandmasters(obj.objects, path, $ax.style.resumesuspendtextalignment(); $ax.removecachedrepeaterinfo(repeaterid); $ax.messagecenter.endcombineeventmessages(); reshow repeater was originally shown (load complete by now) if(shown !itemspregen) document.getelementbyid(repeaterid).style.visibility="inherit" ; $ax.dynamicpanelmanager.fitparentpanel(repeaterid); reapply state after refresh text styles, applying a non-default that wasn't reset certain refreshes (adaptive changed example). way more selective doing safe change moment if(refreshtype $ax.style.updatestateclass(repeaterid); right we assume only one at time. can manually trigger refreshes, may possibly change. $ax.action.refreshend(); _repeatermanager.refreshrepeater="_refreshRepeater;" _getitemquery="function(repeaterId," preevalmap) (diagramobject, elementid) also check not preeval if(preevalmap) if(preevalmap[itemid]) false; all objects as their parent, except itself. scriptid="_getScriptIdFromElementId(elementId);" $ax.getparentrepeaterfromscriptid(scriptid)="=" repeaterid query; _repeatermanager.refreshallrepeaters="function()" $ax('*').each(function(diagramobject, if(!$ax.public.fn.isrepeater(diagramobject.type)) return; if($ax.visibility.iselementidlimboorinlimbocontainer(elementid)) _initpageinfo(diagramobject, elementid); _refreshrepeater(elementid, $ax.geteventinfofromevent($ax.getjbrowserevent()), _refreshtype.persist); _repeatermanager.refreshrepeaters="function(ids," eventinfo) _refreshrepeater(ids[i], eventinfo); _initpageinfo="function(obj," pageinfo="{};" map="obj.repeaterPropMap;" currentviewid="$ax.adaptive.currentViewId" itemsperpage="_getAdaptiveProp(map," 'itemsperpage', currentviewid, elementid, obj); if(itemsperpage="=" pageinfo.nolimit="true;" pageinfo.itemsperpage="itemsPerPage;" pageinfo.currpage="_getAdaptiveProp(map," 'currpage', repeatertopageinfo[elementid]="pageInfo;" _repeatermanager.initialize="function()" $ax(function (obj) $ax.public.fn.isrepeater(obj.type); }).each(function (obj, repeaterid) _initpregen(repeaterid); _initpregen="function(repeaterId)" obj="$ax.getObjectFromScriptId(repeaterId);" propmap="obj.repeaterPropMap;" no wrap, then set above number of rows viewid="$ax.adaptive.currentViewId" 'wrap', viewid, repeaterid, vertical="_getAdaptiveProp(propMap," 'vertical', orderedids="[];" background="_getAdaptiveProp(propMap," 'backcolor', hasaltcolor="_getAdaptiveProp(propMap," 'hasaltcolor', altcolor="hasAltColor" _getadaptiveprop(propmap, 'altcolor', obj) undefined; bounds="_getVisibleDataBounds(repeaterToPageInfo[repeaterId]," obj.data.length); start="bounds[0];" end="bounds[1];" starts empty if(start="=" end) $ax.action.refreshend(repeaterid); unprocessedbaseids="$jobj($ax.repeater.createElementId(repeaterId," 1)).html().match( -sb" statequery.find('.nicescroll-rails').css('margin-top', headerheight 'px'); $ax.adaptive.addnicescroll(statequery, emulatetouch: true, horizrailenabled: obj.scrollbars }, blockresetscroll); statequery.css('cursor', 'url(resources css images touch.cur), auto'); touch.svg) 32, _dynamicpanelmanager.initmobilescroll="function" () scrollable="[];" $ax('*').each(function ($ax.public.fn.isdynamicpanel(obj.type) !$ax.visibility.iselementidlimboorinlimbocontainer(scriptid)) scrollable[scrollable.length]="elementId;" - 1;>= 0; i--) {
            var panelId = scrollable[i];
            var stateId = $ax.repeater.applySuffixToElementId(panelId, '_state0');
            _updateMobileScroll(panelId, stateId);
        }
    };
    

    _dynamicPanelManager.initialize = function() {
        $axure.resize(_handleResize);
        $(window).scroll(_handleScroll);
    };

    var percentPanelToLeftCache = [];
    var percentPanelsInitialized = false;
    var _handleResize = function() {
        if(percentPanelsInitialized) {
            for(var key in percentPanelToLeftCache) {
                //could optimize to only update non-contained panels
                _updatePanelPercentWidth(key);
            }
        } else {
            $ax('*').each(function(obj, elementId) {
                if(_isPercentWidthPanel(obj)) _updatePanelPercentWidth(elementId);
            });
            percentPanelsInitialized = true;
        }
        _adjustFixedCenter();
    };

    var _isPercentWidthPanel = _dynamicPanelManager.isPercentWidthPanel = function(obj) {
        return obj && $ax.public.fn.IsDynamicPanel(obj.type) && obj.percentWidth;
    };

    _dynamicPanelManager.updatePanelContentPercentWidth = function(elementId) {
        //        if(_isPercentWidthPanel($obj(elementId))) return;
        var stateChildrenQuery = $jobj(elementId).children('.panel_state');
        stateChildrenQuery.children('.panel_state_content').each(
            function() {
                $(this).children('.ax_dynamic_panel').each(
                    function() { _updatePanelPercentWidth(this.id); }
                );
            }
        );
    };

    _dynamicPanelManager.updatePercentPanelCache = function(query) {
        query.each(function(obj, elementId) {
            if(_isPercentWidthPanel(obj)) {
                if(_updatePercentPanelToLeftCache(obj, elementId, true)) {
                    _updatePanelPercentWidth(elementId);
                }
            }
        });
    };

    var _handleScroll = function () {
        _adjustFixedCenter();
    };

    var fixedCenterPanels = [];
    var fixedCenterPanelsInitialized = false;

    var _adjustFixedCenter = function () {

        if (!fixedCenterPanelsInitialized) {
            $axure(function(diagramObject) {
                     return diagramObject.fixedHorizontal && diagramObject.fixedHorizontal == 'center' && !diagramObject.percentWidth;
                })
                .each(function (diagramObject, elementId) {
                    fixedCenterPanels.push(elementId);
                });
            fixedCenterPanelsInitialized = true;
        }

        for (var i = 0; i < fixedCenterPanels.length; i++) {
            var elementId = fixedCenterPanels[i];
            var boundingRect = $ax('#' + elementId).offsetBoundingRect();
            var left = boundingRect.left;

            var win = $(window);
            var winWidth = win.width();
            var elementQuery = $('#' + elementId);

            if (left >= 0 && winWidth >= boundingRect.width) {
                elementQuery.css('left', '50%');
                continue;
            }

            var leftMargin = $ax.getNumFromPx(elementQuery.css('margin-left'));
            var newLeft = -leftMargin;
            elementQuery.css('left', newLeft + 'px');
        }
    };

    _dynamicPanelManager.resetFixedPanel = function(obj, domElement) {
        if(obj.fixedHorizontal == 'center') domElement.style.marginLeft = "";
        if(obj.fixedVertical == 'middle') domElement.style.marginTop = "";
    };

    _dynamicPanelManager.resetAdaptivePercentPanel = function(obj, domElement) {
        if(!_isPercentWidthPanel(obj)) return;

        if(obj.fixedHorizontal == 'center') domElement.style.marginLeft = "";
        else if(obj.fixedHorizontal == 'right') domElement.style.width = "";
    };

    var _updatePercentPanelToLeftCache = function(obj, elementId, overwrite) {
        var wasUpdated = false;
        var jObj = $jobj(elementId);
        var axObj = $ax('#' + elementId);
        if(percentPanelToLeftCache[elementId] == undefined || overwrite) {
            if (obj.fixedHorizontal == 'center') percentPanelToLeftCache[elementId] = $ax.getNumFromPx(jObj.css('margin-left'));
            else if (obj.fixedHorizontal == 'right') percentPanelToLeftCache[elementId] = axObj.width() + $ax.getNumFromPx(jObj.css('right'));
            else percentPanelToLeftCache[elementId] = $ax.getNumFromPx(jObj.css('left'));
            wasUpdated = true;
        }

        if(obj.fixedHorizontal == 'right' && _isIdFitToContent(elementId)) {
            //var fitWidth = getContainerSize($ax.visibility.GetPanelState(elementId) + '_content').width;
            var containerId = $ax.visibility.GetPanelState(elementId) + '_content';
            var childrenRect = $ax('#' + containerId).childrenBoundingRect();
            var fitWidth = childrenRect.right;
            percentPanelToLeftCache[elementId] = fitWidth + $ax.getNumFromPx(jObj.css('right'));
            wasUpdated = true;
        }
        return wasUpdated;
    };

    var _updatePanelPercentWidth = _dynamicPanelManager.updatePanelPercentWidth = function(elementId) {
        var obj = $obj(elementId);
        if(!_isPercentWidthPanel(obj)) return;

        _updatePercentPanelToLeftCache(obj, elementId, false);

        var width;
        var x;

        if(obj.fixedHorizontal) {
            x = 0;
            width = $(window).width();
        } else {
            var parentPanelInfo = getParentPanel(elementId);
            if(parentPanelInfo) {
                var parentId = parentPanelInfo.parent;
                width = $ax('#' + parentId).width();
                var parentObj = $obj(parentId);
                if(parentObj.percentWidth) {
                    var stateId = $ax.repeater.applySuffixToElementId(parentId, '_state' + parentPanelInfo.state);
                    var stateContentId = stateId + '_content';
                    x = -$ax.getNumFromPx($jobj(stateContentId).css('margin-left'));
                } else x = 0;
            } else {
                var parentRepeater = $ax.getParentRepeaterFromScriptId($ax.repeater.getScriptIdFromElementId(elementId));
                if(parentRepeater) {
                    var itemId = $ax.repeater.getItemIdFromElementId(elementId);
                    var itemContainerId = $ax.repeater.createElementId(parentRepeater, itemId);
                    x = 0;
                    width = $ax('#' + itemContainerId).width();
                } else {
                    var $window = $(window);
                    width = $window.width();
                    var bodyLeft = $ax.getNumFromPx($('body').css('left'));
                    var bodyWidth = $ax.getNumFromPx($('body').css('width'));
                    var isCenter = $ax.adaptive.getPageStyle().pageAlignment == 'center';
                    width = Math.max(width, bodyWidth);
                    x = isCenter ? -(width - bodyWidth) / 2 - bodyLeft : 0;
                }
            }
        }

        var jObj = $jobj(elementId);
        if(obj.fixedHorizontal == 'left') jObj.css('left', x + 'px');
        else if(obj.fixedHorizontal == 'center') {
            jObj.css('left', x + 'px');
            jObj.css('margin-left', 0 + 'px');
        } else jObj.css('left', x + 'px');

        jObj.css('width', width + 'px');

        $ax.visibility.setResizedSize(elementId, width, $ax('#' + elementId).height());
        
        var panelLeft = percentPanelToLeftCache[elementId];
        var stateParent = jObj;
        while(stateParent.children()[0].id.indexOf($ax.visibility.CONTAINER_SUFFIX) != -1) stateParent = stateParent.children();
        var stateChildrenQuery = stateParent.children('.panel_state');
        stateChildrenQuery.css('width', width + 'px');

        if(obj.fixedHorizontal == 'center')
            stateChildrenQuery.children('.panel_state_content').css('left', '50%').css('margin-left', panelLeft + 'px');
        else if(obj.fixedHorizontal == 'right')
            stateChildrenQuery.children('.panel_state_content').css('left', width - panelLeft + 'px');
        else stateChildrenQuery.children('.panel_state_content').css('margin-left', panelLeft - x + 'px');
    };


    _dynamicPanelManager.updateParentsOfNonDefaultFitPanels = function () {
        $ax('*').each(function (diagramObject, elementId) {
            if(!$ax.public.fn.IsDynamicPanel(diagramObject.type) || !diagramObject.fitToContent) return;
            if($ax.visibility.isElementIdLimboOrInLimboContainer(elementId)) return;

            var stateId = $ax.visibility.GetPanelState(elementId);
            if(stateId != $ax.repeater.applySuffixToElementId(elementId, '_state0')) _fitParentPanel(elementId);
        });
    };

    _dynamicPanelManager.updateAllLayerSizeCaches = function() {
        var fitToContent = [];
        var layers = [];
        $ax('*').each(function (obj, elementId) {
            var isLayer = $ax.public.fn.IsLayer(obj.type);
            if(!isLayer) return;
            if($ax.visibility.isElementIdLimboOrInLimboContainer(elementId)) return;
            layers[layers.length] = elementId;
        });
        for(var i = layers.length - 1; i >= 0; i--) {
            var layerId = layers[i];
            _updateLayerRectCache(layerId);
        }
    };

    //_dynamicPanelManager.updateAllFitPanelsAndLayerSizeCaches = function() {
    //    var fitToContent = [];
    //    var layers = [];
    //    $ax('*').each(function (obj, elementId) {
    //        var isFitPanel = $ax.public.fn.IsDynamicPanel(obj.type) && obj.fitToContent;
    //        var isLayer = $ax.public.fn.IsLayer(obj.type);
    //        if(!isFitPanel && !isLayer) return;
    //        if($ax.visibility.isElementIdLimboOrInLimboContainer(elementId)) return;

    //        if(isFitPanel) {
    //            fitToContent[fitToContent.length] = elementId;
    //        } else if(isLayer) {
    //            layers[layers.length] = elementId;
    //        }
    //    });
    //    for(var i = fitToContent.length - 1; i >= 0; i--) {
    //        var panelId = fitToContent[i];
    //        var stateCount = $obj(panelId).diagrams.length;
    //        for(var j = 0; j < stateCount; j++) {
    //            $ax.dynamicPanelManager.setFitToContentCss(panelId, true);
    //            _updateFitPanel(panelId, j, true);
    //        }
    //    }
    //    for(var i = layers.length - 1; i >= 0; i--) {
    //        var layerId = layers[i];
    //        _updateLayerSizeCache(layerId);
    //    }
    //};

    //var _getCachedLayerRect = function (elementId) {
    //    var element = document.getElementById(elementId);
    //    var rect = {};
    //    rect.width = Number(element.getAttribute('data-width'));
    //    rect.height = Number(element.getAttribute('data-height'));
    //    rect.x = Number(element.getAttribute('data-left'));
    //    rect.y = Number(element.getAttribute('data-top'));
    //    return rect;
    //}

    var _updateLayerRectCache = function (elementId) {
        //var oldRect = _getCachedLayerRect(elementId);

        var axObj = $ax('#' + elementId);
        var oldRect = axObj.offsetBoundingRect();

        var childrenRect = axObj.childrenBoundingRect();
        var size = childrenRect.size;
        var loc = childrenRect.location;
        //var size = axObj.size();
        //var loc = {};
        //loc.x = axObj.locRelativeIgnoreLayer(false);
        //loc.y = axObj.locRelativeIgnoreLayer(true);
        
        var sizeChange = oldRect.width != size.width || oldRect.height != size.height;
        var locChange = oldRect.x != loc.x || oldRect.y != loc.y;
        if(sizeChange || locChange) {
            //var element = document.getElementById(elementId);
            if(sizeChange) {
                //element.setAttribute('data-width', size.width);
                //element.setAttribute('data-height', size.height);
                $ax.visibility.setResizedSize(elementId, size.width, size.height);
                $ax.event.raiseSyntheticEvent(elementId, 'onResize');
            }
            if(locChange) {
                //element.setAttribute('data-left', loc.x);
                //element.setAttribute('data-top', loc.y);
                $ax.visibility.setMovedLocation(elementId, loc.x, loc.y);
                $ax.event.raiseSyntheticEvent(elementId, 'onMove');
            }
            return true;
        }
        return false;
    }

    _dynamicPanelManager.setFitToContentCss = function(elementId, fitToContent, oldWidth, oldHeight) {

        if($ax.dynamicPanelManager.isIdFitToContent(elementId) == fitToContent) return;

        var panel = $jobj(elementId);
        var stateCss;
        var scrollbars = $obj(elementId).scrollbars;

        if(fitToContent) {
            panel.attr('style', '');
            panel.removeAttr('data-notfit');
            stateCss = {};
            stateCss.position = 'relative';
            if(scrollbars != 'none') {
                stateCss.overflow = 'visible';
                stateCss['-webkit-overflow-scrolling'] = 'visible';
            }
            if(scrollbars == 'verticalAsNeeded') {
                stateCss['overflow-x'] = 'visible';
                stateCss['-ms-overflow-x'] = 'visible';
            } else if(scrollbars == 'horizontalAsNeeded') {
                stateCss['overflow-y'] = 'visible';
                stateCss['-ms-overflow-y'] = 'visible';
            }
            panel.children().css(stateCss);
        } else {
            panel.attr('data-notfit', 'true');
            var panelCss = { width: oldWidth, height: oldHeight };
            stateCss = { width: oldWidth, height: oldHeight };
            panelCss.overflow = 'hidden';
            stateCss.position = 'absolute';
            if(scrollbars != 'none') {
                stateCss.overflow = 'auto';
                stateCss['-webkit-overflow-scrolling'] = 'touch';
            }
            if(scrollbars == 'verticalAsNeeded') {
                stateCss['overflow-x'] = 'hidden';
                stateCss['-ms-overflow-x'] = 'hidden';
            } else if(scrollbars == 'horizontalAsNeeded') {
                stateCss['overflow-y'] = 'hidden';
                stateCss['-ms-overflow-y'] = 'hidden';
            }
            panel.css(panelCss);
            panel.children().css(stateCss);
        }
    };

    var _getShownStateId = function (id) {
        var obj = $obj(id);
        if (!obj || !$ax.public.fn.IsDynamicPanel(obj.type)) return id;

        var children = $ax.visibility.applyWidgetContainer(id, true, false, true).children();
        for (var i = 0; i < children.length; i++) {
            var child = children[i];
            while ($ax.visibility.isContainer(child.id)) child = $(child).children()[0];
            if (child && child.style && child.style.display != 'none') return child.id;
        }
        return id;
    };

    var _getShownStateObj = function(id) { return $ax('#' + _getShownStateId(id));}

    _dynamicPanelManager.getShownState = function (id) { return $jobj(_getShownStateId(id)); };

    var _getClamp = function(id) {
        var obj = $obj(id);
        if(!obj) return $ax('#' + id);
        if ($ax.public.fn.IsDynamicPanel(obj.type)) return _getShownStateObj(id);
        return $ax('#' + id);
    };

    var _updateFitPanel = function(panelId, stateIndex) {
        if(!panelId) return false;

        // Only fit if fitToContent is true
        if(!$ax.dynamicPanelManager.isIdFitToContent(panelId)) return false;

        // Traverse through children to find what size it should be.
        var stateId = $ax.repeater.applySuffixToElementId(panelId, '_state' + stateIndex);

        var stateContentId = stateId + '_content';
        var stateQuery = $jobj(stateId);

        //var size = getContainerSize(stateContentId);
        var childrenRect = $ax('#' + stateContentId).childrenBoundingRect();
        var size = {width: childrenRect.right, height: childrenRect.bottom};
        
        // Skip if size hasn't changed
        var oldWidth = stateQuery.width();
        var oldHeight = stateQuery.height();
        if(oldWidth == size.width && oldHeight == size.height) return false;

        var isPercentWidth = $obj(panelId).percentWidth;
        if(!isPercentWidth) stateQuery.width(size.width);
        stateQuery.height(size.height);

        //updatePercentWidth on all child panels
        $jobj(stateContentId).children('.ax_dynamic_panel').each(
            function() { _updatePanelPercentWidth(this.id); }
        );

        //do the following only if it is the current state
        if(stateId != $ax.visibility.GetPanelState(panelId)) return false;

        //var panelQuery = $jobj(panelId);
        //if (!isPercentWidth) panelQuery.attr('data-width', size.width);
        //panelQuery.attr('data-height', size.height);
        $ax.visibility.setResizedSize(panelId, isPercentWidth ? $ax('#' + panelId).width() : size.width, size.height);

        _adjustFixed(panelId, oldWidth, oldHeight, size.width, size.height);
        
        $ax.event.raiseSyntheticEvent(panelId, 'onResize');
        $ax.flyoutManager.updateFlyout(panelId);

        return true;
    };

    // widgetId is the one that crawls up masters until it finds a parent panel, targetId is the original widgetId (not the crawling master)
    // finds the immediate parent panel and crawls up through masters but not repeaters 
    var getParentPanel = function(widgetId, path, targetId) {
        path = path || $ax.getPathFromScriptId($ax.repeater.getScriptIdFromElementId(widgetId));

        var obj = $obj(widgetId);
        if(obj.parentDynamicPanel) {
            path[path.length - 1] = obj.parentDynamicPanel;
            var parentId = $ax.getScriptIdFromPath(path);
            if(!parentId) return undefined;
            parentId = $ax.repeater.getElementId(parentId, widgetId);
            var parentObj = $obj(parentId);
            var retVal = { parent: parentId };
            for(var i = 0; i < parentObj.diagrams.length; i++) {
                var stateId = $ax.repeater.applySuffixToElementId(parentId, '_state' + i);
                var stateQuery = $jobj(stateId);
                if(stateQuery.find('#' + (targetId || widgetId)).length != 0) {
                    retVal.state = i;
                    retVal.stateId = stateId;
                    break;
                }
            }
            return retVal;
        }

        if(path.length == 1) return undefined;

        path.pop();
        var parentMaster = $ax.getScriptIdFromPath(path);
        if(!parentMaster) return undefined;
        parentMaster = $ax.repeater.getElementId(parentMaster, widgetId);

        //check if the master is in the same repeater as the widgetId widget
        var parentMasterItemId = $ax.repeater.getItemIdFromElementId(parentMaster);
        var widgetItemId = $ax.repeater.getItemIdFromElementId(widgetId);
        if(parentMasterItemId != widgetItemId) return undefined;

        return getParentPanel(parentMaster, path, targetId || widgetId);
    };

    // finds the immediate parent layer and crawls up through masters but not repeaters or panels
    var getParentLayer = function (widgetId, path) {
        path = path || $ax.getPathFromScriptId($ax.repeater.getScriptIdFromElementId(widgetId));

        //gets immediate parent layer only
        var layerId = $ax.getLayerParentFromElementId(widgetId);
        if(layerId) return layerId;

        if(path.length == 1) return undefined;

        path.pop();
        var parentMaster = $ax.getScriptIdFromPath(path);
        if(!parentMaster) return undefined;
        parentMaster = $ax.repeater.getElementId(parentMaster, widgetId);

        //check if the master is in the same panel as the widgetId widget
        var widgetParentPanel = getParentPanel(widgetId);
        if(widgetParentPanel) {
            var parentMasterParentPanel = getParentPanel(parentMaster);
            if(!parentMasterParentPanel || widgetParentPanel.parent != parentMasterParentPanel.parent) return undefined;
        }

        //check if the master is in the same repeater as the widgetId widget
        var parentMasterItemId = $ax.repeater.getItemIdFromElementId(parentMaster);
        var widgetItemId = $ax.repeater.getItemIdFromElementId(widgetId);
        if(parentMasterItemId != widgetItemId) return undefined;

        return getParentLayer(parentMaster, path);
    };

    //// TODO: May be a better location for this. Used currently for rdo and panel state containers
    //var getContainerSize = function(containerId) {
    //    var containerQuery = containerId ? $jobj(containerId) : $('#base');
    //    var children = containerQuery.children();
    //    // Default size
    //    var size = { width: 0, height: 0 };
    //    for(var i = 0; i < children.length; i++) {
    //        var child = $(children[i]);
    //        var childId = child.attr('id');
    //        //var axChild = $ax('#' + childId).width();

    //        var childObj = $obj(childId);
    //        if(!childObj) {
    //            // On the body there are some children that should be ignored, as they are not objects.
    //            if(!child.hasClass('basiclink') || child.get(0).tagName.toLowerCase() != 'a') continue;

    //            // Otherwise it should be a basic link
    //            var linkChildren = child.children();
    //            if(!linkChildren.length) continue;
    //            child = $(linkChildren[0]);
    //            childId = child.attr('id');
    //            childObj = $obj(childId);
    //        }

    //        // Ignore fixed
    //        if(!childId || $ax.visibility.limboIds[childId] || !$ax.visibility.IsIdVisible(childId)
    //            || $ax.public.fn.IsDynamicPanel(childObj.type) && childObj.fixedHorizontal) continue;

    //        var boundingRect = $ax.public.fn.getWidgetBoundingRect(childId);
    //        var position = { left: boundingRect.left, top: boundingRect.top };
    //        var width = boundingRect.width;
    //        var height = boundingRect.height;

    //        if($ax.public.fn.IsMaster(childObj.type)) {
    //            var masterSize = getContainerSize(childId);
    //            width = masterSize.width;
    //            height = masterSize.height;
    //            //            } else if($ax.public.fn.IsRepeater(childObj.type)) {
    //            //                var repeaterSize = $ax.repeater.getRepeaterSize(childId);
    //            //                width = repeaterSize.width;
    //            //                height = repeaterSize.height;

    //            //                if(width == 0 && height == 0) continue;

    //            //                position.left += childObj.x;
    //            //                position.top += childObj.y;
    //        } else if ($ax.public.fn.IsDynamicPanel(childObj.type)) {
    //            if($ax.dynamicPanelManager.isIdFitToContent(childId)) {
    //                var stateQuery = $jobj($ax.visibility.GetPanelState(childId));
    //                width = stateQuery.width();
    //                height = stateQuery.height();
    //            }
    //        }

    //        size.width = Math.max(size.width, position.left + width);
    //        size.height = Math.max(size.height, position.top + height);
    //    }

    //    return size;
    //};
    //_dynamicPanelManager.getContainerSize = getContainerSize;

    var _adjustFixed = _dynamicPanelManager.adjustFixed = function(panelId, oldWidth, oldHeight, width, height) {
        var loc = _getFixedPosition(panelId, oldWidth, oldHeight, width, height);
        if(loc) {
            $ax.action.addAnimation(panelId, $ax.action.queueTypes.move, function() {
                $ax.move.MoveWidget(panelId, loc[0], loc[1], { easing: 'none', duration: 0 }, false, null, true);
            });
        }
    };

    var _getFixedPosition = _dynamicPanelManager.getFixedPosition = function(panelId, oldWidth, oldHeight, width, height) {
        var panelObj = $obj(panelId);
        var x = 0;
        var y = 0;
        if(panelObj.fixedHorizontal == 'center') {
            x = (oldWidth - width) / 2;
        }
        if(panelObj.fixedVertical == 'middle') {
            y = (oldHeight - height) / 2;
        }
        return x == 0 && y == 0 ? undefined : [x, y];
    };

    _dynamicPanelManager.getFixedInfo = function(panelId) {
        var panelObj = $obj(panelId);
        if (!panelObj || !$ax.public.fn.IsDynamicPanel(panelObj.type)) return {};
        var jobj = $jobj(panelId);
        if(jobj.css('position') == 'absolute') return {};

        var info = {};
        var horizontal = panelObj.fixedHorizontal;
        if(!horizontal) return info;

        info.fixed = true;
        info.horizontal = horizontal;
        info.vertical = panelObj.fixedVertical;

        if (info.horizontal == 'left') info.x = $ax.getNumFromPx(jobj.css('left'));
        else if (info.horizontal == 'center') info.x = $ax.getNumFromPx(jobj.css('margin-left'));
        else if (info.horizontal == 'right') info.x = $ax.getNumFromPx(jobj.css('right'));

        if (info.vertical == 'top') info.y = $ax.getNumFromPx(jobj.css('top'));
        else if (info.vertical == 'middle') info.y = $ax.getNumFromPx(jobj.css('margin-top'));
        else if (info.vertical == 'bottom') info.y = $ax.getNumFromPx(jobj.css('bottom'));

        return info;
    };

    // Show isn't necessary if this is always done before toggling (which is currently true), but I don't want that
    //  change (if it happened) to break this.
    var _compressToggle = function (id, vert, show, easing, duration) {
        var layer = $ax.getTypeFromElementId(id) == $ax.constants.LAYER_TYPE;
        var locProp = vert ? 'top' : 'left';
        var dimProp = vert ? 'height' : 'width';

        var threshold;
        var delta;

        threshold = $ax('#' + id)[locProp](true);
        delta = layer ? $ax('#' + id)[dimProp]() : _getShownStateObj(id)[dimProp]();

        if(!show) {
            // Need to make threshold bottom/right
            threshold += delta;
            // Delta is in the opposite direction
            delta *= -1;
        }

        _compress(id, vert, threshold, delta, easing, duration);
    };
    _dynamicPanelManager.compressToggle = _compressToggle;

    // Used when setting state of dynamic panel
    var _compressDelta = function(id, oldState, newState, vert, easing, duration) {
        var oldQuery = $jobj(oldState);
        var newQuery = $jobj(newState);

        var thresholdProp = vert ? 'top' : 'left';
        var thresholdOffset = vert ? 'height' : 'width';
        var threshold = $ax('#' + id)[thresholdProp](true);
        threshold += oldQuery[thresholdOffset]();

        var delta = newQuery[thresholdOffset]() - oldQuery[thresholdOffset]();

        var clampOffset = vert ? 'width' : 'height';
        var clampWidth = Math.max(oldQuery[clampOffset](), newQuery[clampOffset]());
         
        _compress(id, vert, threshold, delta, easing, duration, clampWidth);
    };
    _dynamicPanelManager.compressDelta = _compressDelta;

    var _compress = function (id, vert, threshold, delta, easing, duration, clampWidth) {
        // If below, a horizantal clamp, otherwise a vertical clamp
        var clamp = {
            prop: vert ? 'left' : 'top',
            offset: vert ? 'width' : 'height'
        };

        // Get clamp in coords relative to parent. Account for layers farther down
        if($ax.getTypeFromElementId(id) == $ax.constants.LAYER_TYPE) {
            clamp.start = $ax('#' + id)[clamp.prop](true);
            clamp.end = clamp.start + $ax('#' + id)[clamp.offset]();
        } else {
            var clampLoc = $jobj(id);
            if(typeof clampWidth == 'undefined') clampWidth = _getClamp(id)[clamp.offset]();

            clamp.start = $ax.getNumFromPx(clampLoc.css(clamp.prop));
            clamp.end = clamp.start + clampWidth;
        }

        // If clamps, threshold, or delta is not a number, can't compress.
        if (isNaN(clamp.start) || isNaN(clamp.end) || isNaN(threshold) || isNaN(delta)) return;

        // Update clamp if fixed, to account for body position (only necessary when page centered)
        if($jobj(id).css('position') == 'fixed') {
            var clampDelta = $('#base').position().left;
            clamp.start -= clampDelta;
            clamp.end -= clampDelta;
        }

        if(!easing) {
            easing = 'none';
            duration = 0;
        }
        var parent = $ax('#' + id).getParents(false, ['item', 'state', 'layer'])[0];
        var obj = parent && $ax.getObjectFromElementId($ax.repeater.removeSuffixFromElementId(parent));
        // Go until you hit a parent item or state, or a layer that is hidden to use as parent.
        // Account for layer container positions as you go.
        while(obj && $ax.public.fn.IsLayer(obj.type) && $ax.visibility.IsIdVisible(parent)) {
            var container = $ax.visibility.applyWidgetContainer(parent, true, true);
            // If layer is using container, offset is going to be necessary
            if(container.length) {
                var offsetX = $ax.getNumFromPx(container.css('left'));
                var offsetY = $ax.getNumFromPx(container.css('top'));
                var clampProp = clamp.prop == 'left' ? offsetX : offsetY;
                var threshProp = clamp.prop == 'left' ? offsetY : offsetX;
                threshold += threshProp;
                clamp.start += clampProp;
                clamp.end += clampProp;
            }

            parent = $ax('#' + parent).getParents(false, ['item', 'state', 'layer'])[0];
            obj = parent && $ax.getObjectFromElementId($ax.repeater.removeSuffixFromElementId(parent));
        }

        // Add container mid push causes strange behavior because we take container into account as we go down, but if after we accounted for it,
        //  a container is added, that container is not accounted for with threshold and clamp values.
        var layer = obj && $ax.public.fn.IsLayer(obj.type) && parent;
        if(layer) {
            // If your parent layer is invisible, you want to be relative to it's container. That is true already if it has a container,
            //  but if you are just adding one now, then you need to offset your values
            var needsOffset = !$jobj(layer + '_container').length && !$ax.visibility.IsIdVisible(layer);
            $ax.visibility.pushContainer(layer, false);
            if(needsOffset) {
                container = $jobj(layer + '_container');
                offsetX = $ax.getNumFromPx(container.css('left'));
                offsetY = $ax.getNumFromPx(container.css('top'));
                clampProp = clamp.prop == 'left' ? offsetX : offsetY;
                threshProp = clamp.prop == 'left' ? offsetY : offsetX;
                threshold -= threshProp;
                clamp.start -= clampProp;
                clamp.end -= clampProp;
            }
        }

        // Note: If parent is body, some of these aren't widgets
        if(parent && $jobj(parent + '_content').length > 0) parent = parent + '_content';
        if(parent && $jobj(parent + '_container').length > 0) parent = parent + '_container';
        _compressChildrenHelper(id, $(parent ? '#' + parent : '#base').children(), vert, threshold, delta, clamp, easing, duration);

        if(layer) $ax.visibility.popContainer(layer, false);

        // Do item push
        var itemId = $ax.repeater.getItemIdFromElementId(id);
        if(!itemId) return;

        var repeaterId = $ax.getParentRepeaterFromElementId(id);
        // Only need to push when parent is an item directly.
        if(parent != $ax.repeater.createElementId(repeaterId, itemId)) return;
        
        // If repeater is fit to content, then don't worry about it, it'll be handled elsewhere
        if(!obj.repeaterPropMap.fitToContent) $ax.repeater.pushItems(repeaterId, itemId, delta, vert);
    };

    var _compressChildrenHelper = function (id, children, vert, threshold, delta, clamp, easing, duration, parentLayer) {
        var toMove = [];
        var allMove = true;
        for (var i = 0; i < children.length; i++) {
            var child = $(children[i]);

            // Check for basic links
            if(child[0] && child[0].tagName == 'A' && child.hasClass('basiclink')) child = child.children();
            var childId = child.attr('id');

            // TODO: Played with this a lot, went with a safer fix, but I don't like the catch all with !$obj(childId), should handle these cases explicitally.
            //       ann/ref suffixes should skip without turning off allMove, lightbox should be skipped, and is unclear if allMove should be turned off, I think others including container, inner_container, div, img, and text should not be hit ever.
            // Don't move self, and check id to make sure it a widget and not a fixed panel
            if(childId == id || !childId || childId[0] != 'u' || !$obj(childId) || $obj(childId).fixedVertical) {
                // ann/ref widgets should not stop allMove, they move if their widget does, and that widget will be checked and turn this off if it doesn't move
                var suffix = childId && childId.split('_')[1];
                allMove = allMove && (suffix == 'ann' || suffix == 'ref');
                continue;
            }

            if ($ax.getTypeFromElementId(childId) == $ax.constants.LAYER_TYPE) {
                $ax.visibility.pushContainer(childId, false);
                var addSelf;
                var container = $ax.visibility.applyWidgetContainer(childId, true, true);
                var layerChildren = (container.length ? container : child).children();
                //if(container.length) {
                var offsetX = -$ax.getNumFromPx(container.css('left'));
                var offsetY = -$ax.getNumFromPx(container.css('top'));
                var clampProp = clamp.prop == 'left' ? offsetX : offsetY;
                var threshProp = clamp.prop == 'left' ? offsetY : offsetX;
                var layerClamp = { prop: clamp.prop, offset: clamp.offset, start: clamp.start + clampProp, end: clamp.end + clampProp };
                addSelf = _compressChildrenHelper(id, layerChildren, vert, threshold + threshProp, delta, layerClamp, easing, duration, childId);
                //} else addSelf = _compressChildrenHelper(id, layerChildren, vert, threshold, delta, clamp, easing, duration, childId);

                if(addSelf) toMove.push(childId);
                else allMove = false;
                $ax.visibility.popContainer(childId, false);
                continue;
            }

            var numbers = childId.substring(1).split('-');
            if(numbers.length < 1 || isNaN(Number(numbers[0])) || (numbers.length == 2 && isNaN(Number(numbers[1]))) || numbers.length > 2) continue;

            var marker, childClamp;

            var axChild = $ax('#' + childId);
            var markerProp = vert ? 'top' : 'left';
            marker = Number(axChild[markerProp](true));
            childClamp = [Number(axChild[clamp.prop](true))];

            if(parentLayer) {
                var axParent = $ax('#' + parentLayer);
                marker -= Number(axParent[markerProp](true));
                childClamp[0] -= Number(axParent[clamp.prop](true));
            }

            // Dynamic panels are not reporting correct size sometimes, so pull it from the state. Get shown state just returns the widget if it is not a dynamic panel.
            var sizeChild = _getShownStateObj(childId);
            childClamp[1] = childClamp[0] + sizeChild[clamp.offset]();

            if(isNaN(marker) || isNaN(childClamp[0]) || isNaN(childClamp[1]) ||
                marker < threshold || childClamp[1] <= clamp.start || childclamp[0]>= clamp.end) {
                allMove = false;
                continue;
            }

            toMove.push(childId);
        }

        if (allMove && parentLayer) {
            return true;
        } else {
            for(var i = 0; i < toMove.length; i++) {
                $ax('#' + toMove[i]).moveBy(vert ? 0 : delta, vert ? delta : 0, easing == 'none' ? {} : { duration: duration, easing: easing });
            }
        }
        return false;
    };

    var _parentHandlesStyles = function(id) {
        var parents = $ax('#' + id).getParents(true, ['dynamicPanel', 'layer'])[0];
        if(!parents) return false;
        var directParent = true;
        for(var i = 0; i < parents.length; i++) {
            var parentId = parents[i];
            var parentObj = $obj(parentId);
            if(!parentObj.propagate) {
                directParent = false;
                continue;
            }
            return { id: parentId, direct: directParent };
        }
        return false;
    };
    _dynamicPanelManager.parentHandlesStyles = _parentHandlesStyles;

    var _propagateMouseOver = function(id, value) {
        propagate(id, true, value);
    };
    _dynamicPanelManager.propagateMouseOver = _propagateMouseOver;

    var _propagateMouseDown = function(id, value) {
        propagate(id, false, value);
    };
    _dynamicPanelManager.propagateMouseDown = _propagateMouseDown;

    var propagate = function(id, hover, value) {
        var hoverChildren = function(children) {
            if(!children) return;
            for(var i = 0; i < children.length; i++) {
                var elementId = children[i].id;
                var obj = $obj(elementId);
                if(obj == null) {
                    elementId = elementId.split('_')[0];
                    obj = $obj(elementId);
                }
                if(obj == null) continue;
                if (($ax.public.fn.IsDynamicPanel(obj.type) || $ax.public.fn.IsLayer(obj.type)) && !obj.propagate) continue;

                if(hover) $ax.style.SetWidgetHover(elementId, value);
                else $ax.style.SetWidgetMouseDown(elementId, value);
                $ax.annotation.updateLinkLocations(elementId);

                hoverChildren(children[i].children);
            }
        };
        hoverChildren($ax('#' + id).getChildren(true)[0].children);
    };
});
</=></=></=>