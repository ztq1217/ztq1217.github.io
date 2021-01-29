$axure.internal(function($ax) {
    $ax.adaptive = {};

    $axure.utils.makeBindable($ax.adaptive, ["viewChanged"]);

    var _auto = true;
    var _autoIsHandledBySidebar = false;

    var _views;
    var _idToView;
    var _enabledViews = [];

    var _initialViewToLoad;
    var _initialViewSizeToLoad;

    var _loadFinished = false;
    $ax.adaptive.loadFinished = function() {
        if(_loadFinished) return;
        _loadFinished = true;
        if($ax.adaptive.currentViewId) $ax.viewChangePageAndMasters();
        else $ax.postAdaptiveViewChanged();
    };

    var _handleResize = function(forceSwitchTo) {
        if(!_auto) return;
        if(_auto && _autoIsHandledBySidebar && !forceSwitchTo) return;

        var $window = $(window);
        var height = $window.height();
        var width = $window.width();

        var toView = _getAdaptiveView(width, height);
        var toViewId = toView && toView.id;

        _switchView(toViewId, forceSwitchTo);
    };

    var _setAuto = $ax.adaptive.setAuto = function(val) {
        if(_auto != val) {
            _auto = Boolean(val);
        }
    };

    var _setLineImage = function(id, imageUrl) {
        $jobj(id).attr('src', imageUrl);
    };

    var _switchView = function (viewId, forceSwitchTo) {
        //if(!$ax.pageData.isAdaptiveEnabled) return;

        var previousViewId = $ax.adaptive.currentViewId;
        if(typeof previousViewId == 'undefined') previousViewId = '';
        if(typeof viewId == 'undefined') viewId = '';
        if (viewId == previousViewId) {
            if(forceSwitchTo) $ax.postAdaptiveViewChanged(forceSwitchTo);
            return;
        }

        $ax('*').each(function(obj, elementId) {
            if (!$ax.public.fn.IsTreeNodeObject(obj.type)) return;
            if(!obj.hasOwnProperty('isExpanded')) return;

            var query = $ax('#' + elementId);
            var defaultExpanded = obj.isExpanded;

            query.expanded(defaultExpanded);
        });

        // reset all the inline positioning from move and rotate actions including size and transformation
        $axure('*').each(function (diagramObject, elementId) {
            if(diagramObject.isContained) return;
            if($ax.getParentRepeaterFromElementIdExcludeSelf(elementId)) return;

            var element = document.getElementById(elementId);
            if(element) {
                var resetCss = {
                    top: "", left: "", width: "", height: "", opacity: "",
                    transform: "", webkitTransform: "", MozTransform: "", msTransform: "", OTransform: ""
                };
                var query = $(element);
                query.css(resetCss);
                var isPanel = $ax.public.fn.IsDynamicPanel(diagramObject.type);
                if(!isPanel || diagramObject.fitToContent) { //keeps size on the panel states when switching adaptive views to optimize fit to panel
                    if(diagramObject.fitToContent) $ax.dynamicPanelManager.setFitToContentCss(elementId, true);
                    var children = query.children();
                    if(children.length) children.css(resetCss);
                }

                $ax.dynamicPanelManager.resetFixedPanel(diagramObject, element);
                $ax.dynamicPanelManager.resetAdaptivePercentPanel(diagramObject, element);
            }
        });

        $ax.adaptive.currentViewId = viewId; // we need to set this so the enabled and selected styles will apply properly
        if(previousViewId) {
            $ax.style.clearAdaptiveStyles();
            $('*').removeClass(previousViewId);
        } else {
            $ax.style.reselectElements();
        }

        $axure('*').each(function (obj, elementId) {
            if($ax.getParentRepeaterFromElementIdExcludeSelf(elementId)) return;

            $ax.style.updateElementIdImageStyle(elementId); // When image override exists, fix styling/borders
        });

        //$ax.style.startSuspendTextAlignment();

        // reset all the images only if we're going back to the default view
        if(!viewId) {
            $axure('*').each(function (diagramObject, elementId) {
                if($ax.getParentRepeaterFromElementIdExcludeSelf(elementId)) return;

                $ax.placeholderManager.refreshPlaceholder(elementId);

                var images = diagramObject.images;
                if(diagramObject.type == 'horizontalLine' || diagramObject.type == 'verticalLine') {
                    var startImg = images['start~'];
                    _setLineImage(elementId + "_start", startImg);
                    var endImg = images['end~'];
                    _setLineImage(elementId + "_end", endImg);
                    var lineImg = images['line~'];
                    _setLineImage(elementId + "_line", lineImg);
                } else if(diagramObject.type == $ax.constants.CONNECTOR_TYPE) {
                    _setAdaptiveConnectorImages(elementId, images, '');
                } else if(images) {
                    if (diagramObject.generateCompound) {

                        if($ax.style.IsWidgetDisabled(elementId)) {
                            disabledImage = _getImageWithTag(images, 'disabled~');
                            if(disabledImage) $ax.style.applyImage(elementId, disabledImage, 'disabled');
                            return;
                        }
                        if($ax.style.IsWidgetSelected(elementId)) {
                            selectedImage = _getImageWithTag(images, 'selected~');
                            if(selectedImage) $ax.style.applyImage(elementId, selectedImage, 'selected');
                            return;
                        }
                        $ax.style.applyImage(elementId, _getImageWithTag(images, 'normal~'), 'normal');
                    } else {
                        if ($ax.style.IsWidgetDisabled(elementId)) {
                            var disabledImage = _matchImage(elementId, images, [], 'disabled', true);                            
                            if (disabledImage) $ax.style.applyImage(elementId, disabledImage, 'disabled');
                            return;
                        }
                        if ($ax.style.IsWidgetSelected(elementId)) {
                            var selectedImage = _matchImage(elementId, images, [], 'selected', true);  
                            if (selectedImage) $ax.style.applyImage(elementId, selectedImage, 'selected');
                            return;
                        }
                        var normalImage = _matchImage(elementId, images, [], 'normal', true);  
                        $ax.style.applyImage(elementId, normalImage, 'normal');
                    }
                }

                //align all text
                var child = $jobj(elementId).children('.text');
                if(child.length) $ax.style.transformTextWithVerticalAlignment(child[0].id, function() { });
            });
            // we have to reset visibility if we aren't applying a new view
            $ax.visibility.resetLimboAndHiddenToDefaults();
            $ax.visibility.clearMovedAndResized();
            $ax.repeater.refreshAllRepeaters();
            $ax.dynamicPanelManager.updateParentsOfNonDefaultFitPanels();
            $ax.dynamicPanelManager.updatePercentPanelCache($ax('*'));
        } else {
            $ax.visibility.clearLimboAndHidden();
            $ax.visibility.clearMovedAndResized();
            _applyView(viewId);
            $ax.repeater.refreshAllRepeaters();
            $ax.dynamicPanelManager.updateAllLayerSizeCaches();
            $ax.dynamicPanelManager.updateParentsOfNonDefaultFitPanels();
        }

        $ax.annotation.updateAllFootnotes();
        //$ax.style.resumeSuspendTextAlignment();

        $ax.adaptive.triggerEvent('viewChanged', {});
        if(_loadFinished) $ax.viewChangePageAndMasters(forceSwitchTo);
    };

    var _getImageWithTag  = function(image, tag) {
        var flattened = {};
        for (var component in image) {
            var componentImage = image[component][tag];
            if(componentImage) flattened[component] = componentImage;
        }
        return flattened;
    }

    // gets the inheritance chain of a particular view.
    var _getAdaptiveIdChain = $ax.adaptive.getAdaptiveIdChain = function(viewId) {
        if(!viewId) return [];
        var view = _idToView[viewId];
        var chain = [];
        var current = view;
        while(current) {
            chain[chain.length] = current.id;
            current = _idToView[current.baseViewId];
        }
        return chain.reverse();
    };

    var _getMasterAdaptiveIdChain = $ax.adaptive.getMasterAdaptiveIdChain = function (masterId, viewId) {
        if (!viewId) return [];

        var master = $ax.pageData.masters[masterId];
        var masterViews = master.adaptiveViews;
        var idToMasterView = {};
        if (masterViews && masterViews.length > 0) {
            for (var i = 0; i < masterViews.length; i++) {
                var view = masterViews[i];
                idToMasterView[view.id] = view;
            }
        }

        if (!idToMasterView) return [];

        var view = idToMasterView[viewId];
        var chain = [];
        var current = view;
        while (current) {
            chain[chain.length] = current.id;
            current = idToMasterView[current.baseViewId];
        }
        return chain.reverse();
    };

    var _getPageStyle = $ax.adaptive.getPageStyle = function() {
        var currentViewId = $ax.adaptive.currentViewId;
        var adaptiveChain = _getAdaptiveIdChain(currentViewId);

        var currentStyle = $.extend({}, $ax.pageData.page.style);
        for(var i = 0; i < adaptiveChain.length; i++) {
            var viewId = adaptiveChain[i];
            $.extend(currentStyle, $ax.pageData.page.adaptiveStyles[viewId]);
        }

        return currentStyle;
    };

    var _setAdaptiveLineImages = function(elementId, images, viewIdChain) {
        for(var i = viewIdChain.length - 1; i >= 0; i--) {
            var viewId = viewIdChain[i];
            var startImg = images['start~' + viewId];
            if(startImg) {
                _setLineImage(elementId + "_start", startImg);
                var endImg = images['end~' + viewId];
                _setLineImage(elementId + "_end", endImg);
                var lineImg = images['line~' + viewId];
                _setLineImage(elementId + "_line", lineImg);
                break;
            }
        }
    };

    var _setAdaptiveConnectorImages = function (elementId, images, view) {
        var conn = $jobj(elementId);
        var count = conn.children().length-1; // -1 for rich text panel
        for(var i = 0; i < count; i++) {
            var img = images['' + i + '~' + view];
            $jobj(elementId + '_seg' + i).attr('src', img);
        }
    };

    var _applyView = $ax.adaptive.applyView = function(viewId, query) {
        var limboIds = {};
        var hiddenIds = {};

        var jquery;
        if(query) {
            jquery = query.jQuery();
            jquery = jquery.add(jquery.find('*'));
            var jqueryAnn = $ax.annotation.jQueryAnn(query);
            jquery = jquery.add(jqueryAnn);
        } else {
            jquery = $('*').not('#ios-safari-fixed');
            query = $ax('*');
        }
        jquery.addClass(viewId);
        var viewIdChain = _getAdaptiveIdChain(viewId);
        // this could be made more efficient by computing it only once per object
        query.each(function(diagramObject, elementId) {
            _applyAdaptiveViewOnObject(diagramObject, elementId, viewIdChain, viewId, limboIds, hiddenIds);
        });

        $ax.visibility.addLimboAndHiddenIds(limboIds, hiddenIds, query);
        //$ax.dynamicPanelManager.updateAllFitPanelsAndLayerSizeCaches();
        $ax.dynamicPanelManager.updatePercentPanelCache(query);
    };

    var _applyAdaptiveViewOnObject = function(diagramObject, elementId, viewIdChain, viewId, limboIds, hiddenIds) {
        var adaptiveChain = [];
        for(var i = 0; i < viewIdChain.length; i++) {
            var viewId = viewIdChain[i];
            var viewStyle = diagramObject.adaptiveStyles[viewId];
            if(viewStyle) {
                adaptiveChain[adaptiveChain.length] = viewStyle;
                if (viewStyle.size) $ax.public.fn.convertToSingleImage($jobj(elementId));
            }
        }

        var state = $ax.style.generateState(elementId);

        // set the image
        var images = diagramObject.images;
        if(images) {
            if(diagramObject.type == 'horizontalLine' || diagramObject.type == 'verticalLine') {
                _setAdaptiveLineImages(elementId, images, viewIdChain);
            } else if (diagramObject.type == $ax.constants.CONNECTOR_TYPE) {
                _setAdaptiveConnectorImages(elementId, images, viewId);
            } else if (diagramObject.generateCompound) {
                var compoundUrl = _matchImageCompound(diagramObject, elementId, viewIdChain, state);
                if (compoundUrl) $ax.style.applyImage(elementId, compoundUrl, state);
            }else {
                var imgUrl = _matchImage(elementId, images, viewIdChain, state);
                if(imgUrl) $ax.style.applyImage(elementId, imgUrl, state);
            }
        }
        // addaptive override style (not including default style props)
        var adaptiveStyle = $ax.style.computeAllOverrides(elementId, undefined, state, viewId);

        // this style INCLUDES the object's my style
        var compoundStyle = $.extend({}, diagramObject.style, adaptiveStyle);

        if (diagramObject.owner.type == 'Axure:Master' && diagramObject.adaptiveStyles) {
            adaptiveStyle = $ax.style.computeFullStyle(elementId, state, viewId);
        }

        if(!diagramObject.isContained) {
            $ax.style.setAdaptiveStyle(elementId, adaptiveStyle);
        }

        var scriptId = $ax.repeater.getScriptIdFromElementId(elementId);
        if(compoundStyle.limbo && !diagramObject.isContained) limboIds[scriptId] = true;
        // sigh, javascript. we need the === here because undefined means not overriden
        if(compoundStyle.visible === false) hiddenIds[scriptId] = true;
    };

    var _matchImage = function(id, images, viewIdChain, state, doNotProgress) {
        var override = $ax.style.getElementImageOverride(id, state);
        if(override) return override;

        if(!images) return undefined;

        var scriptId = $ax.repeater.getScriptIdFromElementId(id);
        // first check all the images for this state
        for(var i = viewIdChain.length - 1; i >= 0; i--) {
            var viewId = viewIdChain[i];
            var img = images[scriptId + "~" + state + "~" + viewId];
            if(!img) img = images[state + "~" + viewId];
            if(img) return img;
        }
        // check for the default state style
        var defaultStateImage = images[scriptId + "~" + state + "~"];
        if(!defaultStateImage) defaultStateImage = images[state + "~"];
        if(defaultStateImage) return defaultStateImage;

        if(doNotProgress) return undefined;

        state = $ax.style.progessState(state);
        if (state) return _matchImage(scriptId, images, viewIdChain, state);

        // SHOULD NOT REACH HERE! NORMAL SHOULD ALWAYS CATCH AT THE DEFAULT!
        return images['normal~']; // this is the default
    };

    var _matchImageCompound = function(diagramObject, id, viewIdChain, state) {
        var images = [];
        for(var i = 0; i < diagramObject.compoundChildren.length; i++) {
            var component = diagramObject.compoundChildren[i];
            images[component] = _matchImage(id, diagramObject.images[component], viewIdChain, state);
        }
        return images;
    };



    $ax.adaptive.getImageForStateAndView = function(id, state) {
        var viewIdChain = _getAdaptiveIdChain($ax.adaptive.currentViewId);
        var diagramObject = $ax.getObjectFromElementId(id);
        if (diagramObject.generateCompound) return _matchImageCompound(diagramObject, id, viewIdChain, state);
        else return _matchImage(id, diagramObject.images, viewIdChain, state);
    };

    var _getAdaptiveView = function(winWidth, winHeight) {
        var _isViewOneGreaterThanTwo = function (view1, view2, winHeight) {
            if (view1.size.width > view2.size.width) return true;
            if (view1.size.width == view2.size.width) {
                if (view2.size.height <= winheight) return view1.size.height> view2.size.height && view1.size.height <= winheight; else return view1.size.height < view2.size.height; } false; }; var _isviewonelessthantwo="function(view1," view2) { width2="view2.size.width" || 1000000; artificially large number height2="view2.size.height" width1="view1.size.width" height1="view1.size.height" (width1="=" && height2); _iswindowwidthgreaterthanviewwidth="function(view," width) width>= view.size.width;
        };

        var _isWindowWidthLessThanViewWidth = function(view1, width) {
            var viewWidth = view1.size.width || 1000000;

            return width <= 0 1 5 32 viewwidth; }; var greater="undefined;" less="undefined;" defaultview="$ax.pageData.defaultAdaptiveView;" if (_iswindowwidthgreaterthanviewwidth(defaultview, winwidth, winheight)) for(var i="0;" < _enabledviews.length; i++) { view="_enabledViews[i];" if(_iswindowwidthgreaterthanviewwidth(view, if(!greater || _isviewonegreaterthantwo(view, greater, } if(_iswindowwidthlessthanviewwidth(view, if(!less _isviewonelessthantwo(view, less)) return less; _isadaptiveinitialized="function()" typeof _idtoview !="undefined" ; $ax.messagecenter.addmessagelistener(function(message, data) the adaptive plugin hasn't been initialized yet then save to load so that it can get set when initialize occurs (message="=" 'switchadaptiveview') (window.name ) return; href="window.location.href.split('#')[0];" lastslash="href.lastIndexOf('/');" + 1); if(href =="auto" ? undefined : (data.view="=" 'default' '' data.view); if(!_isadaptiveinitialized()) _initialviewtoload="view;" else _handleloadviewid(view); 'setadaptiveviewforsize') _autoishandledbysidebar="true;" _initialviewsizetoload="data;" _handlesetviewforsize(data.width, data.height); 'getscale') prevscalen="data.prevScaleN;" newscalen="1;" contentoriginoffset="0;" $body="$('body');" $body.css('height', ''); (data.scale adjustscrollscale="false;" ($('html').getnicescroll().length="=" && !mobile_device !safari) adding nicescroll width is correct getting scale _addnicescroll($('html'), emulatetouch: false, horizrailenabled: false }); (!mobile_device safari) _removenicescroll($('html')); $('html').css('overflow-x', 'hidden'); bodywidth="$body.width();" iscentered="$body.css('position')" screen does not adjust on rotation for ios (width always shorter measurement) islandscape="window.orientation" window.orientation mobilewidth="(IOS" (islandscape window.screen.height window.screen.width) - data.panelwidthoffset; scalen="newScaleN" (mobile_device $(window).width()) bodywidth; 2) pagesize="$ax.public.fn.getPageSize();" hscalen="(MOBILE_DEVICE" data.viewportheight $(window).height()) math.max(1, pagesize.bottom); (hscalen scalen) hscalen; (iscentered) * (bodywidth 2); ((safari ios) share_app) $body.first().css('height', pagesize.bottom 'px'); $body.height() (adjustscrollscale) cursorwidth: math.ceil(6 newscalen) 'px', cursorborder: 'px solid #fff', cursorborderradius: 'px' contentscale="{" scalen: newscalen, prevscalen: prevscalen, contentoriginoffset: contentoriginoffset, cliptoview: data.cliptoview, viewportheight: data.viewportheight, viewportwidth: data.viewportwidth, panelwidthoffset: data.panelwidthoffset, scale: data.scale $axure.messagecenter.postmessage('setcontentscale', contentscale); 'setdevicemode') _isdevicemode="data.device;" (data.device) fixes firefox cursor staying outside initial device frame border safari needs entire content height trackpad be disabled (firefox (safari !ios)) $('html').css('height', (!mobile_device) true, $('html').addclass('mobileframecursor'); $('html').css('cursor', 'url(resources css images touch.cur), auto'); touch.svg) 32, (ie) document.addeventlistener("click", function () ie still sometimes wants an argument here this.activeelement.releasepointercapture(); }, false); ($axure.browser.isedge) document.addeventlistener("pointerdown", (e) this.activeelement.releasepointercapture(e.pointerid); $ax.dynamicpanelmanager.initmobilescroll(); gives horizontal scroll android in 100% (handled of iframe) $('body').css('margin', '0px'); $(function _sethorizontalscroll(false); $('html').removeattr('style'); $('html').removeclass('mobileframecursor'); _sethorizontalscroll(!data.scaletowidth); $ax.adaptive.isdevicemode="function" _isdevicemode; _removenicescroll="$ax.adaptive.removeNiceScroll" ($container, blockresetscroll) (!blockresetscroll) $container.scrollleft(0); $container.scrolltop(0); $container.getnicescroll().remove(); clean up $container.css({ '-ms-overflow-y': '', 'overflow-y': '-ms-overflow-style': '-ms-touch-action': _addnicescroll="$ax.adaptive.addNiceScroll" options, $container.nicescroll(options); child containers show scrollbars $ax.adaptive.updatemobilescrollonbody="function" (nicescroll.length="=" 0) nicescroll.resize(); _settrackpadhorizontalscroll="function" (active) preventscroll="function" (math.abs(e.wheeldeltax) e.preventdefault(); (!active) document.body.addeventlistener("mousewheel", preventscroll, passive: document.getelementbyid('html').addeventlistener("mousewheel", document.body.removeeventlistener("mousewheel", document.getelementbyid('html').removeeventlistener("mousewheel", _sethorizontalscroll="function" $body.bind('scroll', ($body.scrollleft() $body.scrollleft(0); $body.unbind('scroll'); $ax.adaptive.setadaptiveview="function(view)" viewidforsitemaptounderstand="view" (view="=" view); _handleloadviewid(viewidforsitemaptounderstand); $ax.adaptive.initialize="function()" _views="$ax.pageData.adaptiveViews;" useviews="$ax.document.configuration.useViews;" if(_views _views.length> 0) {
            for(var i = 0; i < _views.length; i++) {
                var view = _views[i];
                _idToView[view.id] = view;
                if(useViews) _enabledViews[_enabledViews.length] = view;
            }

            if(_autoIsHandledBySidebar && _initialViewSizeToLoad) _handleSetViewForSize(_initialViewSizeToLoad.width, _initialViewSizeToLoad.height);
            else _handleLoadViewId(_initialViewToLoad);
        }

        $axure.resize(function(e) {
            _handleResize();
            $ax.postResize(e); //window resize fires after view changed
        });
    };

    var _handleLoadViewId = function (loadViewId, forceSwitchTo) {
        if(typeof loadViewId != 'undefined') {
            _setAuto(false);
            _switchView(loadViewId != 'default' ? loadViewId : '', forceSwitchTo);
        } else {
            _setAuto(true);
            _handleResize(forceSwitchTo);
        }
    };

    var _handleSetViewForSize = function (width, height) {
        var toView = _getAdaptiveView(width, height);
        var toViewId = toView && toView.id;
        _switchView(toViewId, "auto");
    };

    $ax.adaptive.getSketchKey = function() {
        return $ax.pageData.sketchKeys[$ax.adaptive.currentViewId || ''];
    }
});</=></=></=>