extends ReactGDComponent

var AwesomeButton = ResourceLoader.load("tests\gdx\awesomeButton.gdx")

function render():
	return {"id":"AABI","className":AwesomeButton,"properties":{},"children":[]}

func get_component_name() -> String: return "test5"