tool
extends ReactGDComponent

class ProjectButton:
	extends ReactGDComponent

	signal project(path)

	func on_pressed():
		emit_signal("project", self.props.path)

	func render():
		var default_style := {
			"type": StyleBoxFlat,
			"content_margin": 8.0,
			"corner_radius": 4.0,
		}
		var styles := {
			"btn_normal": create_style([default_style, {
				"bg_color": Color("#333b4f")
			}]),
			"btn_hover": create_style([default_style, {
				"bg_color": Color("#262c3b")
			}]),
			"btn_pressed": create_style([default_style, {
				"bg_color": Color("#202531")
			}]),
		}
		var fonts := {
			"title": create_font({
				"use_filter": true,
				"outline_size": 2.0,
				"outline_color": Color.black,
				"size": 32.0,
				"src": FONTS_PATH + "JetBrainsMono-Bold.ttf"
			}),
		}

		var icon = self.props.icon
		var title = self.props.title

		return {"id":"AALZ","className":ButtonContainer,"properties":{"style_normal":styles.btn_normal,"style_hover":styles.btn_hover,"style_pressed":styles.btn_pressed,"size_flags_horizontal":Control.SIZE_EXPAND_FILL,"on_pressed":on_pressed},"children":[{"id":"AANe","className":HBoxContainer,"properties":{"anchors_preset":Control.PRESET_WIDE},"children":[{"id":"AAOg","className":TextureRect,"properties":{"texture":icon,"expand":true,"rect_min_size":Vector2(48, 48)},"children":[]},{"id":"AAQj","className":Control,"properties":{"rect_min_size:x":8.0},"children":[]},{"id":"AAQj","className":Label,"properties":{"size_flags_vertical":0,"font_font":fonts.title,"text":title},"children":[]}]}]}

const FONTS_PATH := "res://Fonts/JetBrains/fonts/ttf/"
const DEMOS := [
	{
		"title": "Player Inventory",
		"icon": "res://icon.png",
		"path": "res://Demos/Inventory/demo.tscn",
	},
	{
		"title": "Potions Shop",
		"icon": "res://icon.png",
		"path": "res://Demos/Shop/demo.tscn",
	}
]

func on_project(path: String):
	print(path)
	pass

func render():
	var fonts := {
		"title": create_font({
			"use_filter": true,
			"outline_size": 3.0,
			"outline_color": Color.black,
			"size": 32.0,
			"src": FONTS_PATH + "JetBrainsMono-Bold.ttf"
		}),
		"paragraph": create_font({
			"use_filter": true,
			"outline_size": 1.0,
			"outline_color": Color.black,
			"size": 16.0,
			"src": FONTS_PATH + "JetBrainsMono-Medium.ttf"
		})
	}
	var styles := {
		"container": create_style({
			"type": StyleBoxFlat,
			"content_margin": 24.0,
			"corner_radius": 16.0,
			"bg_color": Color("#333b4f")
		}),
		"paragraph": create_style({
			"type": StyleBoxFlat,
			"content_margin_horizontal": 16.0,
			"content_margin_vertical": 8.0,
			"corner_radius": 8.0,
			"bg_color": Color("#202531")
		}),
		"scroll": create_style({
			"type": StyleBoxFlat,
			"bg_color": Color("#202531"),
			"corner_radius": 8.0,
			"content_margin": 8.0,
		}),
	}

	var project_btns := []

	for i in range(DEMOS.size()):
		var proj = DEMOS[i]
		project_btns.append({"id":"AAkK"+str(i),"className":ProjectButton,"properties":{"key":i,"icon":proj.icon,"title":proj.title,"path":proj.path,"on_project":on_project},"children":[]})

	return {"id":"AAnP","className":PanelContainer,"properties":{"anchors_preset":Control.PRESET_WIDE,"margin_left":16.0,"margin_right":-16.0,"margin_top":16.0,"margin_bottom":-16.0,"style_panel":styles.container},"children":[{"id":"AApV","className":VBoxContainer,"properties":{},"children":[{"id":"AApW","className":Label,"properties":{"font_font":fonts.title,"text":"Welcome to ReactGD demos!"},"children":[]},{"id":"AAqW","className":Control,"properties":{"rect_min_size:y":16.0},"children":[]},{"id":"AAqY","className":RichTextLabel,"properties":{"fit_content_height":true,"font_normal_font":fonts.paragraph,"style_normal":styles.paragraph,"text":"Bellow you can find buttons to access each demo, click on then to go to each one and then go back here to go to other demos"},"children":[]},{"id":"AAtd","className":Control,"properties":{"rect_min_size:y":8.0},"children":[]},{"id":"AAue","className":ScrollContainer,"properties":{"size_flags_vertical":Control.SIZE_EXPAND_FILL,"style_bg":styles.scroll},"children":[{"id":"AAvh","className":VBoxContainer,"properties":{"size_flags_horizontal":Control.SIZE_EXPAND_FILL,"size_flags_vertical":Control.SIZE_EXPAND_FILL,"children":project_btns,"const_separation":8},"children":[]}]}]}]}